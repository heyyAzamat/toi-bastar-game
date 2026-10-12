// Guestbook on Solana devnet. A guest's visit is ONE transaction to the host's wallet:
//   SystemProgram.transfer (the shashu, may be 0) + a Memo "TOI|<id>|<seat>|<tenge>|<avatar>|<name>|<wish>".
// The host's wallet history is therefore the guestbook: seats, wishes and shashu are read back from it.
// web3.js is loaded lazily so the game itself stays light.
import { activeProvider } from '../solana';
import { profile } from '../storage';
import { track } from '../idos';
import type { ToiInvite } from './link';
import { TENGE_MINT } from '../tenge';

export const DEVNET = 'https://api.devnet.solana.com';
export const MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
/** Shashu on devnet: 1 in-game tenge = 0.001 devnet SOL. */
export const LAMPORTS_PER_TENGE = 1_000_000;
const MIN_FEE_LAMPORTS = 10_000;

export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
export const explorerAddr = (a: string) => `https://explorer.solana.com/address/${a}?cluster=devnet`;

export interface Wish {
  sig: string;
  guest: string; // signer wallet
  seat: number;
  tenge: number; // from the actual on-chain transfer
  avatar: string; // e.g. "kelin1"
  name: string;
  wish: string;
  time: number; // unix seconds
}

const clean = (s: string) => s.replace(/\|/g, '/');

export function encodeMemo(id: string, seat: number, tenge: number, avatar: string, name: string, wish: string) {
  return ['TOI', id, seat, tenge, avatar, clean(name).slice(0, 12), clean(wish).slice(0, 140)].join('|');
}

function parseMemo(raw: string) {
  // RPC memo fields look like "[93] TOI|...": strip the length prefix.
  const text = raw.replace(/^\[\d+\]\s*/, '');
  const i = text.indexOf('TOI|');
  if (i < 0) return null;
  const [, id, seat, tenge, avatar, name, ...rest] = text.slice(i).split('|');
  return { id, seat: Number(seat), tenge: Number(tenge), avatar, name, wish: rest.join('|') };
}

/** spl-token and parts of Metaplex expect Node's global Buffer; browsers don't have one. */
export async function ensureBuffer() {
  const g = globalThis as any;
  if (!g.Buffer) g.Buffer = (await import('buffer')).Buffer;
}

async function web3() {
  await ensureBuffer();
  return import('@solana/web3.js');
}

async function connection() {
  const { Connection } = await web3();
  return new Connection(DEVNET, 'confirmed');
}

export async function devnetBalance(address: string): Promise<number> {
  const { PublicKey } = await web3();
  return (await connection()).getBalance(new PublicKey(address));
}

/** Ask the devnet faucet for 1 SOL. The public faucet is rate-limited, so this can fail. */
export async function airdrop(address: string): Promise<boolean> {
  try {
    const { PublicKey, LAMPORTS_PER_SOL } = await web3();
    const conn = await connection();
    const sig = await conn.requestAirdrop(new PublicKey(address), LAMPORTS_PER_SOL);
    const bh = await conn.getLatestBlockhash();
    await conn.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
    return true;
  } catch {
    return false;
  }
}

export type SendResult = { ok: true; sig: string } | { ok: false; reason: 'no-wallet' | 'no-sol' | 'no-tenge' | 'rejected' | 'error'; detail?: string };

export async function sendWish(inv: ToiInvite, seat: number, tenge: number, avatar: string, wish: string): Promise<SendResult> {
  const p = activeProvider();
  if (!p || !profile.wallet) return { ok: false, reason: 'no-wallet' };
  try {
    const { PublicKey, SystemProgram, Transaction, TransactionInstruction } = await web3();
    const { Buffer } = await import('buffer');
    const conn = await connection();
    const from = new PublicKey(profile.wallet);
    const host = new PublicKey(inv.w);
    // With a TENGE mint configured, shashu is real TENGE; otherwise it falls back to devnet SOL.
    const lamports = TENGE_MINT ? 0 : tenge * LAMPORTS_PER_TENGE;
    if ((await conn.getBalance(from)) < lamports + MIN_FEE_LAMPORTS * (TENGE_MINT && tenge ? 250 : 1)) return { ok: false, reason: 'no-sol' };
    const tx = new Transaction();
    // Always include a SOL transfer (even of 0) so the host's wallet is part of the transaction:
    // that is what lets the host find it in their history.
    tx.add(SystemProgram.transfer({ fromPubkey: from, toPubkey: host, lamports }));
    if (TENGE_MINT && tenge > 0) {
      const spl = await import('@solana/spl-token');
      const mint = new PublicKey(TENGE_MINT);
      const src = spl.getAssociatedTokenAddressSync(mint, from, false, spl.TOKEN_2022_PROGRAM_ID);
      const dst = spl.getAssociatedTokenAddressSync(mint, host, false, spl.TOKEN_2022_PROGRAM_ID);
      const have = await conn.getTokenAccountBalance(src).then((b) => Number(b.value.uiAmount ?? 0)).catch(() => 0);
      if (have < tenge) return { ok: false, reason: 'no-tenge' };
      // The first guest opens the host's TENGE account (idempotent afterwards).
      tx.add(spl.createAssociatedTokenAccountIdempotentInstruction(from, dst, host, mint, spl.TOKEN_2022_PROGRAM_ID));
      tx.add(spl.createTransferCheckedInstruction(src, mint, dst, from, tenge, 0, [], spl.TOKEN_2022_PROGRAM_ID));
    }
    tx.add(new TransactionInstruction({
      programId: new PublicKey(MEMO_PROGRAM),
      keys: [{ pubkey: from, isSigner: true, isWritable: false }],
      data: Buffer.from(encodeMemo(inv.id, seat, tenge, avatar, profile.name, wish), 'utf8'),
    }));
    const bh = await conn.getLatestBlockhash();
    tx.recentBlockhash = bh.blockhash;
    tx.feePayer = from;
    // Sign only, then send to devnet ourselves: works whatever network the wallet is set to.
    let signed;
    try {
      signed = await p.signTransaction(tx);
    } catch (e: any) {
      return { ok: false, reason: 'rejected', detail: String(e?.message ?? e) };
    }
    const sig = await conn.sendRawTransaction(signed.serialize());
    await conn.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
    track('guestbook_sign', undefined, tenge);
    return { ok: true, sig };
  } catch (e: any) {
    return { ok: false, reason: 'error', detail: String(e?.message ?? e).slice(0, 60) };
  }
}

/** Every wish of this toi, oldest first. */
export async function fetchWishes(inv: ToiInvite): Promise<Wish[]> {
  const { PublicKey } = await web3();
  const conn = await connection();
  const sigs = (await conn.getSignaturesForAddress(new PublicKey(inv.w), { limit: 500 }))
    .filter((s) => !s.err && s.memo && s.memo.includes(`TOI|${inv.id}|`));
  if (!sigs.length) return [];
  const txs = await conn.getParsedTransactions(sigs.map((s) => s.signature), { maxSupportedTransactionVersion: 0 });
  let hostAta: string | null = null;
  if (TENGE_MINT) {
    const spl = await import('@solana/spl-token');
    hostAta = spl.getAssociatedTokenAddressSync(new PublicKey(TENGE_MINT), new PublicKey(inv.w), false, spl.TOKEN_2022_PROGRAM_ID).toBase58();
  }
  const out: Wish[] = [];
  sigs.forEach((s, i) => {
    const tx = txs[i];
    const m = parseMemo(s.memo!);
    if (!tx || !m || m.id !== inv.id) return;
    const signer = tx.transaction.message.accountKeys.find((k) => k.signer)?.pubkey.toBase58() ?? '';
    // Trust the chain, not the memo, for the amount actually sent: TENGE transfers into the host's
    // TENGE account, or (without a TENGE mint) devnet SOL at 1 tenge = 0.001 SOL.
    let lamports = 0;
    let tokens = 0;
    for (const ix of tx.transaction.message.instructions) {
      const parsed = (ix as any).parsed;
      if (parsed?.type === 'transfer' && parsed.info?.destination === inv.w) lamports += parsed.info.lamports ?? 0;
      if (parsed?.type === 'transferChecked' && TENGE_MINT && parsed.info?.mint === TENGE_MINT && hostAta && parsed.info.destination === hostAta) {
        tokens += Number(parsed.info.tokenAmount?.uiAmount ?? 0);
      }
    }
    out.push({
      sig: s.signature, guest: signer, seat: m.seat, tenge: tokens + Math.floor(lamports / LAMPORTS_PER_TENGE),
      avatar: m.avatar, name: m.name, wish: m.wish, time: s.blockTime ?? 0,
    });
  });
  return out.sort((a, b) => a.time - b.time);
}

/** Seat -> wish of the first guest who took it (later claims of the same seat don't displace them). */
export function seating(wishes: Wish[]): Map<number, Wish> {
  const seats = new Map<number, Wish>();
  for (const w of wishes) if (!seats.has(w.seat)) seats.set(w.seat, w);
  return seats;
}
