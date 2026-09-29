// Optional Solana layer via injected wallet providers (Phantom / Solflare). No SDK needed.
import { profile, saveProfile, type Memento } from './storage';

type WalletKind = 'phantom' | 'solflare';

export interface Provider {
  publicKey: { toString(): string } | null;
  connect(): Promise<unknown>;
  disconnect(): Promise<void>;
  signMessage(msg: Uint8Array, enc?: string): Promise<{ signature: Uint8Array } | Uint8Array>;
  signTransaction<T>(tx: T): Promise<T>;
  signAllTransactions?<T>(txs: T[]): Promise<T[]>;
}

/** The connected wallet's provider, if any. */
export function activeProvider(): Provider | null {
  return profile.walletKind && profile.wallet ? provider(profile.walletKind) : null;
}

export function provider(kind: WalletKind): Provider | null {
  const w = window as any;
  if (kind === 'phantom') return w.phantom?.solana ?? (w.solana?.isPhantom ? w.solana : null);
  return w.solflare?.isSolflare ? w.solflare : null;
}

/** On mobile browsers without the extension, reopen the game inside the wallet's in-app browser. */
export const isMobile = () =>
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));

export const hasWallet = (kind?: WalletKind) => (kind ? !!provider(kind) : !!provider('phantom') || !!provider('solflare'));

export function openInWallet(kind: WalletKind) {
  const url = encodeURIComponent(location.href);
  const ref = encodeURIComponent(location.origin);
  window.location.href = kind === 'phantom'
    ? `https://phantom.app/ul/browse/${url}?ref=${ref}`
    : `https://solflare.com/ul/v1/browse/${url}?ref=${ref}`;
}

export const shortAddr = (a: string) => a.slice(0, 4) + '..' + a.slice(-4);

export async function connectWallet(kind: WalletKind): Promise<string | null> {
  const p = provider(kind);
  if (!p) {
    // Mobile: reopen inside the wallet's in-app browser. Desktop: point to the extension.
    if (isMobile()) openInWallet(kind);
    else window.open(kind === 'phantom' ? 'https://phantom.app/download' : 'https://solflare.com/download', '_blank', 'noopener');
    return null;
  }
  await p.connect();
  const addr = p.publicKey?.toString() ?? null;
  profile.wallet = addr;
  profile.walletKind = addr ? kind : null;
  saveProfile();
  return addr;
}

export async function disconnectWallet() {
  const p = profile.walletKind && provider(profile.walletKind);
  try { await p?.disconnect(); } catch {}
  profile.wallet = null;
  profile.walletKind = null;
  saveProfile();
}

/** Re-attach silently if the wallet already trusts this site. */
export async function restoreWallet() {
  if (!profile.walletKind) return;
  const p = provider(profile.walletKind) as any;
  try {
    await p?.connect({ onlyIfTrusted: true });
    profile.wallet = p?.publicKey?.toString() ?? profile.wallet;
  } catch {}
}

function toBase64(b: Uint8Array) {
  let s = '';
  b.forEach((x) => (s += String.fromCharCode(x)));
  return btoa(s);
}

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function mementoMetadata(m: Memento, owner: string) {
  return {
    name: `Toi Estelygi - ${m.title}`,
    symbol: 'TOI',
    description: `A 3-star toi hosted by ${profile.name} in Toi Bastar!`,
    image: 'image.png',
    attributes: [
      { trait_type: 'Title', value: m.title },
      { trait_type: 'Stars', value: m.stars },
      { trait_type: 'Hall', value: m.wave },
      { trait_type: 'Date', value: m.date },
    ],
    properties: { creators: [{ address: owner, share: 100 }], files: [{ uri: 'image.png', type: 'image/png' }] },
  };
}

export type MintResult = { ok: true; mint: string } | { ok: false; reason: 'no-wallet' | 'no-service' | 'error'; detail?: string };

/**
 * The player signs the snapshot hash (proof of authorship), then a mint service
 * (VITE_MINT_API) uploads the image and mints the NFT to the player's wallet.
 * Without a configured service we keep the signed memento locally.
 */
export async function mintMemento(m: Memento): Promise<MintResult> {
  const kind = profile.walletKind;
  const p = kind && provider(kind);
  if (!p || !profile.wallet) return { ok: false, reason: 'no-wallet' };
  try {
    const hash = await sha256Hex(m.png);
    const message = `Toi Estelygi\nTitle: ${m.title}\nStars: ${m.stars}\nDate: ${m.date}\nImage SHA-256: ${hash}`;
    const res = await p.signMessage(new TextEncoder().encode(message), 'utf8');
    const sig = res instanceof Uint8Array ? res : res.signature;
    m.signature = toBase64(sig);
    saveProfile();

    const api = import.meta.env.VITE_MINT_API as string | undefined;
    if (!api) return { ok: false, reason: 'no-service' };
    const r = await fetch(api, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ owner: profile.wallet, message, signature: m.signature, image: m.png, metadata: mementoMetadata(m, profile.wallet) }),
    });
    if (!r.ok) return { ok: false, reason: 'error', detail: `HTTP ${r.status}` };
    const { mint } = await r.json();
    m.mint = mint;
    saveProfile();
    return { ok: true, mint };
  } catch (e: any) {
    return { ok: false, reason: 'error', detail: String(e?.message ?? e) };
  }
}
