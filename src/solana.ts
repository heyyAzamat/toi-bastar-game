// Optional Solana layer via injected wallet providers (Phantom / Solflare). No SDK needed.
import { profile, saveProfile } from './storage';
import { track } from './idos';

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
  // idosgames.com frames the game with getters on window.phantom / window.solana that throw
  // (and report a wallet bypass): inside any frame the wallet globals are never read.
  if (embedded()) return null;
  const w = window as any;
  try {
    if (kind === 'phantom') return w.phantom?.solana ?? (w.solana?.isPhantom ? w.solana : null);
    return w.solflare?.isSolflare ? w.solflare : null;
  } catch {
    return null;
  }
}

/** On mobile browsers without the extension, reopen the game inside the wallet's in-app browser.
 * Not from a frame: the frame would navigate away to the wallet's site, which the host page refuses. */
export const canDeeplink = () => isMobile() && !embedded() && !hasWallet();

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

/** Running inside another page's frame (the game's page on idosgames.com). */
export function embedded(): boolean {
  try { return window.self !== window.top; } catch { return true; }
}

export const shortAddr = (a: string) => a.slice(0, 4) + '..' + a.slice(-4);

export async function connectWallet(kind: WalletKind): Promise<string | null> {
  const p = provider(kind);
  // Embedded in idosgames.com the wallet extension may not reach the game's frame: open the game
  // by its own address in a new tab, where the wallet works as usual.
  if (!p && embedded()) {
    window.open(location.href, '_blank', 'noopener');
    return null;
  }
  if (!p) {
    // Mobile: reopen inside the wallet's in-app browser. Desktop: point to the extension.
    if (isMobile()) openInWallet(kind);
    else window.open(kind === 'phantom' ? 'https://phantom.app/download' : 'https://solflare.com/download', '_blank', 'noopener');
    return null;
  }
  // A wallet popup that never answers would leave the game silent: give up after a minute.
  const res: any = await Promise.race([
    p.connect(),
    new Promise((_, no) => setTimeout(() => no(new Error('wallet did not answer')), 60_000)),
  ]);
  const addr = (p.publicKey ?? res?.publicKey)?.toString() ?? null;
  profile.wallet = addr;
  profile.walletKind = addr ? kind : null;
  saveProfile();
  if (addr) track('wallet_connect', { mode: kind });
  return addr;
}

/** A wallet error, short enough for one status line on the 180px screen. */
export function walletError(e: unknown): string {
  const m = (e as any)?.message ?? String(e ?? '');
  return String(m).toUpperCase().replace(/[^A-Z0-9 .,:!?-]/g, '').trim().slice(0, 30) || 'ERROR';
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
