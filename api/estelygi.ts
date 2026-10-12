// POST /api/estelygi  { owner, name, description, attributes, image }   (image = base64 PNG)
// The server uploads the PNG + metadata to Arweave via Irys (paid by the authority), then builds a
// Metaplex Core "create asset" transaction inside the Toi Estelygi collection and signs it as collection
// authority (and with the new asset's key). The player's wallet signs last as payer/owner.
// Returns { asset, tx } with the partially signed transaction (base64).
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createGenericFile, createNoopSigner, createSignerFromKeypair, generateSigner, publicKey, signerIdentity } from '@metaplex-foundation/umi';
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys';
import { create, fetchCollection, mplCore } from '@metaplex-foundation/mpl-core';
import { RPC, authority, bump, collectionAddress, isWallet, json } from './_lib/solana.js';
import { preflight } from './_lib/http.js';

const MAX_PNG = 600_000;
const IRYS = RPC.includes('devnet') ? 'https://devnet.irys.xyz' : 'https://node1.irys.xyz';

function validAttributes(a: unknown): a is { trait_type: string; value: string | number }[] {
  return Array.isArray(a) && a.length <= 8 && a.every((x) => x && typeof x.trait_type === 'string' && x.trait_type.length <= 32
    && (typeof x.value === 'number' || (typeof x.value === 'string' && x.value.length <= 64)));
}

export async function POST(req: Request) {
  const auth = authority();
  const coll = collectionAddress();
  if (!auth || !coll) return json({ error: 'collection not configured' }, 503);
  let b: any;
  try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const { owner, name, description, attributes, image } = b ?? {};
  if (!isWallet(owner) || typeof name !== 'string' || !name.startsWith('Toi Estelygi') || name.length > 32
    || typeof description !== 'string' || description.length > 200 || !validAttributes(attributes) || typeof image !== 'string') {
    return json({ error: 'invalid request' }, 400);
  }
  const png = Buffer.from(image, 'base64');
  if (png.length > MAX_PNG || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return json({ error: 'image must be a PNG under 600 KB' }, 400);
  const today = new Date().toISOString().slice(0, 10);
  if ((await bump(`estelygi:${owner}:${today}`, 1, 86400)) > 10) return json({ error: 'daily limit' }, 429);
  try {
    const umi = createUmi(RPC).use(mplCore()).use(irysUploader({ address: IRYS }));
    const collectionAuthority = createSignerFromKeypair(umi, umi.eddsa.createKeypairFromSecretKey(auth.secretKey));
    umi.use(signerIdentity(collectionAuthority));
    const [imageUri] = await umi.uploader.upload([createGenericFile(png, 'toi-estelygi.png', { contentType: 'image/png' })]);
    const uri = await umi.uploader.uploadJson({
      name, symbol: 'TOI', description, image: imageUri, attributes,
      properties: { files: [{ uri: imageUri, type: 'image/png' }], category: 'image' },
    });
    if (!imageUri || !uri) throw new Error('upload returned no uri');
    const payer = createNoopSigner(publicKey(owner));
    const asset = generateSigner(umi);
    const collection = await fetchCollection(umi, publicKey(coll));
    const tx = await create(umi, { asset, collection, name, uri, owner: publicKey(owner), payer, authority: collectionAuthority })
      .setFeePayer(payer)
      .buildAndSign(umi);
    return json({ ok: true, asset: asset.publicKey.toString(), uri, tx: Buffer.from(umi.transactions.serialize(tx)).toString('base64') });
  } catch (e: any) {
    await bump(`estelygi:${owner}:${today}`, -1, 86400);
    return json({ error: 'mint failed', detail: String(e?.message ?? e).slice(0, 120) }, 500);
  }
}

export const OPTIONS = preflight;
