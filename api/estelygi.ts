// POST /api/estelygi  { owner, uri, name }
// Builds a Metaplex Core "create asset" transaction inside the Toi Estelygi collection. The server signs as
// the collection authority (and with the new asset's key); the player's wallet signs last as payer/owner.
// Returns the partially signed transaction (base64) for the client to sign and send.
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createNoopSigner, createSignerFromKeypair, generateSigner, publicKey, signerIdentity } from '@metaplex-foundation/umi';
import { create, fetchCollection, mplCore } from '@metaplex-foundation/mpl-core';
import { RPC, authority, bump, collectionAddress, isWallet, json } from './_lib/solana';

// Metadata must live on Arweave via Irys (what the client uploader produces).
const URI = /^https:\/\/(gateway\.irys\.xyz|devnet\.irys\.xyz|arweave\.net|node[12]\.irys\.xyz)\/[A-Za-z0-9_-]{20,}$/;

export async function POST(req: Request) {
  const auth = authority();
  const coll = collectionAddress();
  if (!auth || !coll) return json({ error: 'collection not configured' }, 503);
  let b: any;
  try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const { owner, uri, name } = b ?? {};
  if (!isWallet(owner) || typeof uri !== 'string' || !URI.test(uri) || typeof name !== 'string' || !name.startsWith('Toi Estelygi') || name.length > 32) {
    return json({ error: 'invalid request' }, 400);
  }
  const today = new Date().toISOString().slice(0, 10);
  if ((await bump(`estelygi:${owner}:${today}`, 1, 86400)) > 10) return json({ error: 'daily limit' }, 429);
  try {
    const umi = createUmi(RPC).use(mplCore());
    const collectionAuthority = createSignerFromKeypair(umi, umi.eddsa.createKeypairFromSecretKey(auth.secretKey));
    umi.use(signerIdentity(collectionAuthority));
    const payer = createNoopSigner(publicKey(owner));
    const asset = generateSigner(umi);
    const collection = await fetchCollection(umi, publicKey(coll));
    const tx = await create(umi, { asset, collection, name, uri, owner: publicKey(owner), payer, authority: collectionAuthority })
      .setFeePayer(payer)
      .buildAndSign(umi);
    return json({ ok: true, asset: asset.publicKey.toString(), tx: Buffer.from(umi.transactions.serialize(tx)).toString('base64') });
  } catch (e: any) {
    await bump(`estelygi:${owner}:${today}`, -1, 86400);
    return json({ error: 'build failed', detail: String(e?.message ?? e).slice(0, 120) }, 500);
  }
}
