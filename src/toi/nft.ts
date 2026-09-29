// Toi Estelygi NFT for "My Toi" on devnet: image + metadata go to Arweave via Irys (paid in devnet SOL),
// then a Metaplex Core asset is minted to the host. Everything is lazy-loaded.
import { activeProvider } from '../solana';
import { profile } from '../storage';
import { DEVNET } from './chain';
import type { ToiInvite } from './link';

export type NftResult = { ok: true; asset: string; sig: string } | { ok: false; reason: 'no-wallet' | 'error'; detail?: string };

export async function mintToiNft(inv: ToiInvite, png: Uint8Array, guests: number, onStep: (s: 'upload' | 'mint') => void): Promise<NftResult> {
  const p = activeProvider();
  if (!p || !profile.wallet) return { ok: false, reason: 'no-wallet' };
  try {
    const [{ createUmi }, { mplCore, create }, { irysUploader }, { walletAdapterIdentity }, umiLib, { PublicKey }, { base58 }] = await Promise.all([
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
      publicKey: new PublicKey(profile.wallet),
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
    const file = umiLib.createGenericFile(png, 'toi-estelygi.png', { contentType: 'image/png' });
    const [image] = await umi.uploader.upload([file]);
    const uri = await umi.uploader.uploadJson({
      name: `Toi Estelygi: ${inv.n}`.slice(0, 32),
      symbol: 'TOI',
      description: `${inv.n}, ${inv.d}. Hosted by ${inv.h} in Toi Bastar!`,
      image,
      attributes: [
        { trait_type: 'Toi', value: inv.n },
        { trait_type: 'Date', value: inv.d },
        { trait_type: 'Host', value: inv.h },
        { trait_type: 'Guests', value: guests },
      ],
      properties: { files: [{ uri: image, type: 'image/png' }], category: 'image' },
    });

    onStep('mint');
    const asset = umiLib.generateSigner(umi);
    const res = await create(umi, { asset, name: `Toi Estelygi: ${inv.n}`.slice(0, 32), uri }).sendAndConfirm(umi);
    return { ok: true, asset: asset.publicKey.toString(), sig: base58.deserialize(res.signature)[0] };
  } catch (e: any) {
    return { ok: false, reason: 'error', detail: String(e?.message ?? e).slice(0, 80) };
  }
}
