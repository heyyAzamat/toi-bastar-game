// Optional Solana layer via injected wallet providers (Phantom / Solflare). No SDK needed.
import { profile, saveProfile } from './storage';

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
