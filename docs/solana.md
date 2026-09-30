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
- Tenge earned in Shashu / Betashar is kept in the local profile until the player presses **CLAIM**.
- The wallet signs the message `Toi Bastar: claim N TENGE to <wallet> at <ts>`.
- `api/tenge-claim.ts` verifies the signature, rejects stale timestamps (5 min) and replays, applies caps
  (200 per claim, 300 per wallet per day) and mints to the player's associated token account.
- Earnings are counted on the client, which is why the caps exist. This is a known trust gap, not a solved one.

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

## Leaderboard (off-chain)
`api/leaderboard.ts` is a Vercel Function (GET top 20 / POST score) on Upstash Redis REST.
Boards: `all` and `daily-YYYY-MM-DD` (daily boards expire after 8 days).
Without Redis, and in `npm run dev`, the client falls back to a per-device board.
Scores are validated for shape and range but **not signed and not on-chain**, so they can be spoofed.

## Setup from scratch
1. `node scripts/setup-solana.mjs` creates `.secrets/authority.json`. Fund that address with about 0.3 devnet SOL
   (https://faucet.solana.com) and re-run. It then creates the TENGE token and the Toi Estelygi collection and writes `.env.local`.
2. `npm run dev`: the Vite dev server also serves `api/*` with the secrets from `.env.local`.
3. On Vercel, set the variables from `.env.example` (`KV_REST_API_*` enable rate limits and the shared leaderboard).

Never commit `.secrets/` or `.env.local`; both are in `.gitignore`.
