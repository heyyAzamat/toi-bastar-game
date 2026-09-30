// Toi Estelygi NFTs on devnet (3-star game mementos and "My Toi" tables).
// 1. The player's wallet pays Irys (devnet SOL) to put the PNG + metadata on Arweave.
// 2. The server (api/estelygi) builds a Metaplex Core asset inside the Toi Estelygi collection and signs
//    as collection authority; the player signs last as payer/owner and the game sends it to devnet.
//    Without a configured collection, a standalone Core asset is minted instead.
// Everything is lazy-loaded.
import { activeProvider } from '../solana';
import { profile } from '../storage';
import { DEVNET } from './chain';

export interface EstelygiMeta {
  name: string; // starts with "Toi Estelygi"
  description: string;
  attributes: { trait_type: string; value: string | number }[];
}

export type NftResult = { ok: true; asset: string; sig: string; inCollection: boolean } | { ok: false; reason: 'no-wallet' | 'rejected' | 'error'; detail?: string };

export async function mintEstelygi(png: Uint8Array, meta: EstelygiMeta, onStep: (s: 'upload' | 'mint') => void): Promise<NftResult> {
  const p = activeProvider();
  if (!p || !profile.wallet) return { ok: false, reason: 'no-wallet' };
  const name = meta.name.slice(0, 32);
  try {
    const [{ createUmi }, { mplCore, create }, { irysUploader }, { walletAdapterIdentity }, umiLib, web3, { base58 }] = await Promise.all([
      import('@metaplex-foundation/umi-bundle-defaults'),
      import('@metaplex-foundation/mpl-core'),
      import('@metaplex-foundation/umi-uploader-irys'),
      import('@metaplex-foundation/umi-signer-wallet-adapters'),
      import('@metaplex-foundation/umi'),
      import('@solana/web3.js'),
      import('@metaplex-foundation/umi/serializers'),
    ]);
    // Injected providers mostly match the wallet-adapter shape; signMessage differs (Phantom returns { signature }).
    const adapter = {
      publicKey: new web3.PublicKey(profile.wallet),
      signTransaction: (tx: any) => p.signTransaction(tx),
      signAllTransactions: p.signAllTransactions ? (txs: any[]) => p.signAllTransactions!(txs) : undefined,
      signMessage: async (m: Uint8Array) => {
        const r = await p.signMessage(m);
        return r instanceof Uint8Array ? r : r.signature;
      },
    };
    const umi = createUmi(DEVNET)
      .use(mplCore())
      .use(irysUploader({ address: 'https://devnet.irys.xyz' }))
      .use(walletAdapterIdentity(adapter as any));

    onStep('upload');
    const [image] = await umi.uploader.upload([umiLib.createGenericFile(png, 'toi-estelygi.png', { contentType: 'image/png' })]);
    const uri = await umi.uploader.uploadJson({
      name, symbol: 'TOI', description: meta.description, image, attributes: meta.attributes,
      properties: { files: [{ uri: image, type: 'image/png' }], category: 'image' },
    });

    onStep('mint');
    const r = await fetch('/api/estelygi', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ owner: profile.wallet, uri, name }),
    }).catch(() => null);
    if (r && r.ok) {
      const { asset, tx } = await r.json();
      const vtx = web3.VersionedTransaction.deserialize(Uint8Array.from(atob(tx), (c) => c.charCodeAt(0)));
      let signed;
      try {
        signed = await p.signTransaction(vtx);
      } catch (e: any) {
        return { ok: false, reason: 'rejected', detail: String(e?.message ?? e) };
      }
      const conn = new web3.Connection(DEVNET, 'confirmed');
      const sig = await conn.sendRawTransaction(signed.serialize());
      const bh = await conn.getLatestBlockhash();
      await conn.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
      return { ok: true, asset, sig, inCollection: true };
    }
    // No collection service: a standalone Core asset owned by the player.
    const asset = umiLib.generateSigner(umi);
    const res = await create(umi, { asset, name, uri }).sendAndConfirm(umi);
    return { ok: true, asset: asset.publicKey.toString(), sig: base58.deserialize(res.signature)[0], inCollection: false };
  } catch (e: any) {
    return { ok: false, reason: 'error', detail: String(e?.message ?? e).slice(0, 80) };
  }
}

export const dataUrlBytes = (dataUrl: string) => Uint8Array.from(atob(dataUrl.split(',')[1]), (c) => c.charCodeAt(0));
