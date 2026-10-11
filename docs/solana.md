# Solana architecture (devnet)

Everything below runs on **devnet**. The game itself is playable without a wallet; Solana carries the parts
that involve value or other people.

## Accounts

| What | Address |
|------|---------|
| TENGE mint (Token-2022, 0 decimals, on-chain metadata) | [`7QLPA8Yo4bhpMZwJ7nzPF8bqpJaRQPWotjqeupBHDqht`](https://explorer.solana.com/address/7QLPA8Yo4bhpMZwJ7nzPF8bqpJaRQPWotjqeupBHDqht?cluster=devnet) |
| Toi Estelygi collection (Metaplex Core) | [`CrXpxMRYa4Xgm8VDGnmHR7Y8h2mhrEA12WorUePgTHxC`](https://explorer.solana.com/address/CrXpxMRYa4Xgm8VDGnmHR7Y8h2mhrEA12WorUePgTHxC?cluster=devnet) |
| Authority (mint authority + collection authority, server-side only) | [`Gp6YyijmqAHjGLHXxNt6cAvpk42opC9t6tPopHQm1XgZ`](https://explorer.solana.com/address/Gp6YyijmqAHjGLHXxNt6cAvpk42opC9t6tPopHQm1XgZ?cluster=devnet) |

## Verified transactions (2026-09-30)

| Step | Transaction |
|------|-------------|
| Create TENGE mint + metadata | [`41yxuTqC…`](https://explorer.solana.com/tx/41yxuTqCx1YezqBy6fqKA3ypimwW88ThZBj5MWRAjJY9X3xKx4Abg9gEeBamhgJEau7hXgEKd8QPiK9JiwsFaJsB?cluster=devnet) |
| Create Toi Estelygi collection | [`5X4a1nZR…`](https://explorer.solana.com/tx/5X4a1nZRpuGQJX7CX15K7K8eyasENV2pz5Utr4FMpfMhg8pg45S8B8yJQMLaBtnqdvURLxMA7EMF3GCDLrMGzdgB?cluster=devnet) |
| Claim: 60 TENGE minted to a player | [`RuzmMstu…`](https://explorer.solana.com/tx/RuzmMstuFoxVcj3Fjy3UVdHQgE4eCZXnGUzNK8t31eokZUT5qH9i1ZnhtU7f7DpK3ipUQ7jER3Xt44R7ZyJgcud?cluster=devnet) |
| Guestbook entry: 10 TENGE shashu + wish memo | [`4JtQygHr…`](https://explorer.solana.com/tx/4JtQygHrqBHZ2FrsKG6AEaZrn8egsRtE2j7ku4GsCEVPDj2PG2As9Bbbc8RNr6n8o85nDgLhbqB8bKeaqKDURbDX?cluster=devnet) |
| Toi Estelygi NFT minted into the collection | [`5fxdqFV7…`](https://explorer.solana.com/tx/5fxdqFV7XEaUyh1UVW3AFAje7nBDKW8if4BGdr1475DobLWtdPUzMTj2KRJyZTDkzM1pGKiUCuFuXL8bc8QXcE28?cluster=devnet) (asset [`Cym2v589…iMSM`](https://explorer.solana.com/address/Cym2v589uX3mQHWJ824VvjAoXtkBrBLbeDzgvECsiMSM?cluster=devnet)) |

## Wallets
`src/solana.ts` uses the injected Phantom / Solflare providers. On mobile without the extension, it deep-links
into the wallet's in-app browser. web3.js and Metaplex are lazy-loaded, so the game itself stays light.

## TENGE (shashu token)
- Tenge earned in a toi (shashu coins in the halls, Shashu, Betashar) is kept in the local profile until the player presses **CLAIM**.
- The wallet signs the message `Toi Bastar: claim N TENGE to <wallet> at <ts>`.
- `api/tenge-claim.ts` verifies the signature, rejects stale timestamps (5 min) and replays, applies caps
  (200 per claim, 300 per wallet per day) and mints to the player's associated token account.
- A claim can only mint tenge the server counted itself (see *Verified runs* below): `api/run` credits a balance
  keyed by the hash of a random secret in the player's profile, and the claim spends from it (HTTP 402 when it is
  short). The client's own counter only matters for the Bazaar.

## My Toi: invites and the on-chain guestbook
- **Host:** Profile -> MY TOI -> CREATE A TOI. The invite link carries the toi (id, name, date, host name,
  host wallet) in `?toi=`, so no server or database is needed.
- **Guest:** opens the link, picks an avatar and a free seat, chooses shashu and writes a wish (max 140 chars),
  then signs **one** transaction:

  ```
  SystemProgram.transfer(guest -> host, 0)            # makes the tx show up in the host's history
  createAssociatedTokenAccountIdempotent(host ATA)
  transferChecked(TENGE, guest -> host, shashu)
  Memo("TOI|<id>|<seat>|<tenge>|<avatar>|<name>|<wish>")
  ```

  Without a configured mint, shashu falls back to devnet SOL (1 tenge = 0.001 SOL).
  The wallet only signs; the game sends the transaction to devnet itself, so it works whatever network the wallet is set to.
- **Guestbook:** read straight from the host wallet's history (`getSignaturesForAddress`, filtered by the toi's
  memo tag). Shashu amounts come from the actual transfer, not from the memo text. The first guest to claim a seat keeps it.
  See `src/toi/chain.ts`.

## Toi Estelygi NFT (memento)
- A 3-star hall, or a finished My Toi table, can be minted as a **Toi Estelygi** ("toi memento") Metaplex Core asset.
- The game sends the PNG table snapshot + metadata to `api/estelygi.ts`. The server stores them on Arweave via Irys
  (paid by the authority), builds a Core `create` inside the collection and signs as collection authority.
  The player's wallet signs once as payer and owner.
- Rate limit: 10 mints per wallet per day.
- Irys **devnet** uploads are temporary (kept for weeks, not forever). For mainnet, point `SOLANA_RPC` at mainnet
  and the uploader switches to the permanent Irys node.

## Verified runs (`api/run`)
The rules, the clock and the score live in `src/sim/` as a deterministic simulation: fixed 60 Hz ticks, seeded
randomness, no DOM. The browser and the server run the same code.

1. **start**: the server picks the seed (the daily toi uses the date's seed) and stores the run in Redis.
2. After each hall the client sends its action log (`place` / `tool` / `gift`, each stamped with its tick).
   The server replays it and keeps its own score, stars and shashu coins.
3. After each Shashu it sends the taps (tick, x, y), after each Betashar the tap times; both are replayed.
4. **finish**: the server adds up its numbers and writes the leaderboard. Clients can no longer post scores
   (`POST /api/leaderboard` answers 410).

Checks: steps must come in play order, a run belongs to the key that started it, and on Vercel real time between
steps must cover the simulated time. `tests/replay.test.ts` asserts that a replay reproduces the client's result.

What this does not stop: a bot that plays well. The seed is known once a hall starts, so a solver can still post a
strong log, and a Betashar log can claim perfect timing (at most 36 tenge). Rep and hall unlocks stay on the device.

## Leaderboard (off-chain)
`api/leaderboard.ts` (GET top 20) reads Upstash Redis; only `api/run` writes to it.
Boards: `all` and `daily-YYYY-MM-DD` (daily boards expire after 8 days).
Without Redis the client keeps a per-device board, and tois are played unverified.

## Setup from scratch
1. `node scripts/setup-solana.mjs` creates `.secrets/authority.json`. Fund that address with about 0.3 devnet SOL
   (https://faucet.solana.com) and re-run. It then creates the TENGE token and the Toi Estelygi collection and writes `.env.local`.
2. `npm run dev`: the Vite dev server also serves `api/*` with the secrets from `.env.local`.
3. On Vercel, set the variables from `.env.example` (`KV_REST_API_*` enable rate limits and the shared leaderboard).

Never commit `.secrets/` or `.env.local`; both are in `.gitignore`.
