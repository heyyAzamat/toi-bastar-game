// POST /api/tenge-claim  { wallet, amount, ts, signature }
// Mints TENGE (Token-2022, 0 decimals) for tenge earned in Shashu/Betashar to the player's wallet.
// The player signs "Toi Bastar: claim <amount> TENGE to <wallet> at <ts>" to prove the wallet is theirs.
// Earnings are counted on the client, so claims are capped per wallet per day.
import { PublicKey, Transaction } from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction, createMintToCheckedInstruction,
} from '@solana/spl-token';
import { authority, bump, connection, isWallet, json, tengeMint, useOnce, verifySignature } from './_lib/solana';

const MAX_PER_CLAIM = 200;
const MAX_PER_DAY = 300;

export const claimMessage = (wallet: string, amount: number, ts: number) => `Toi Bastar: claim ${amount} TENGE to ${wallet} at ${ts}`;

export async function POST(req: Request) {
  const auth = authority();
  const mint = tengeMint();
  if (!auth || !mint) return json({ error: 'tenge not configured' }, 503);
  let b: any;
  try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const { wallet, amount, ts, signature } = b ?? {};
  if (!isWallet(wallet) || !Number.isInteger(amount) || amount < 1 || amount > MAX_PER_CLAIM || !Number.isInteger(ts) || typeof signature !== 'string') {
    return json({ error: 'invalid request' }, 400);
  }
  if (Math.abs(Date.now() - ts) > 5 * 60_000) return json({ error: 'expired' }, 400);
  if (!verifySignature(wallet, claimMessage(wallet, amount, ts), signature)) return json({ error: 'bad signature' }, 401);
  if (!(await useOnce(`claim:${signature}`, 600))) return json({ error: 'replayed' }, 409);
  const today = new Date().toISOString().slice(0, 10);
  const total = await bump(`tenge:${wallet}:${today}`, amount, 86400);
  if (total > MAX_PER_DAY) {
    await bump(`tenge:${wallet}:${today}`, -amount, 86400);
    return json({ error: 'daily limit', left: Math.max(0, MAX_PER_DAY - (total - amount)) }, 429);
  }
  try {
    const conn = connection();
    const owner = new PublicKey(wallet);
    const ata = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_2022_PROGRAM_ID);
    const tx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(auth.publicKey, ata, owner, mint, TOKEN_2022_PROGRAM_ID),
      createMintToCheckedInstruction(mint, ata, auth.publicKey, amount, 0, [], TOKEN_2022_PROGRAM_ID),
    );
    const bh = await conn.getLatestBlockhash();
    tx.recentBlockhash = bh.blockhash;
    tx.feePayer = auth.publicKey;
    tx.sign(auth);
    const sig = await conn.sendRawTransaction(tx.serialize());
    await conn.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
    return json({ ok: true, sig, amount });
  } catch (e: any) {
    await bump(`tenge:${wallet}:${today}`, -amount, 86400);
    return json({ error: 'mint failed', detail: String(e?.message ?? e).slice(0, 120) }, 500);
  }
}
