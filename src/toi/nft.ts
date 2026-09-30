// Toi Estelygi NFTs on devnet (3-star game mementos and "My Toi" tables), all in one Metaplex Core collection.
// The server (api/estelygi) stores the PNG + metadata on Arweave via Irys and builds the "create asset"
// transaction signed as collection authority; the player's wallet signs once as payer/owner and the game
// sends it to devnet. Only web3.js is loaded in the browser.
import { activeProvider } from '../solana';
import { profile } from '../storage';
import { DEVNET, ensureBuffer } from './chain';

export interface EstelygiMeta {
  name: string; // starts with "Toi Estelygi"
  description: string;
  attributes: { trait_type: string; value: string | number }[];
}

export type NftResult = { ok: true; asset: string; sig: string } | { ok: false; reason: 'no-wallet' | 'off' | 'limit' | 'rejected' | 'error'; detail?: string };

function toBase64(bytes: Uint8Array) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function mintEstelygi(png: Uint8Array, meta: EstelygiMeta, onStep: (s: 'upload' | 'mint') => void): Promise<NftResult> {
  const p = activeProvider();
  if (!p || !profile.wallet) return { ok: false, reason: 'no-wallet' };
  try {
    onStep('upload');
    const r = await fetch('/api/estelygi', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ owner: profile.wallet, ...meta, name: meta.name.slice(0, 32), image: toBase64(png) }),
    });
    const body = await r.json().catch(() => ({}));
    if (r.status === 503) return { ok: false, reason: 'off' };
    if (r.status === 429) return { ok: false, reason: 'limit' };
    if (!r.ok) return { ok: false, reason: 'error', detail: body.detail ?? body.error ?? `HTTP ${r.status}` };

    onStep('mint');
    await ensureBuffer();
    const web3 = await import('@solana/web3.js');
    const vtx = web3.VersionedTransaction.deserialize(Uint8Array.from(atob(body.tx), (c) => c.charCodeAt(0)));
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
    return { ok: true, asset: body.asset, sig };
  } catch (e: any) {
    return { ok: false, reason: 'error', detail: String(e?.message ?? e).slice(0, 80) };
  }
}

export const dataUrlBytes = (dataUrl: string) => Uint8Array.from(atob(dataUrl.split(',')[1]), (c) => c.charCodeAt(0));
