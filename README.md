# Toi Bastar!

Pixel-art, mobile-first Kazakh wedding seating puzzle. 180x320 canvas, integer scaling, touch + mouse.
There are no runtime dependencies. Sprites, the koshkar muiz ornament, the bitmap font and the dombra chiptune are all generated in code.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/ (static)
```

Languages: Kazakh, Russian, English (`src/i18n.ts`). The first launch follows the device language; the start screen has a switch.
The 5x7 pixel font includes Latin and Cyrillic, with the Kazakh letters Ә Ғ Қ Ң Ө Ұ Ү Һ І.

Dev-only URL params: `?wave=4` jumps straight into a hall (1-4), `?speed=4` fast-forwards time.

## How it plays
- Tap to start (unlocks sound), then **TOI BASTAR!** plays a toi through every hall your reputation has unlocked, with Shashu between halls. **DAILY TOI** is one fixed challenge per UTC day (same seed and hall for everyone) with its own leaderboard.
- Guests queue at the bottom. Drag one onto a cushion; drag seated guests to swap. Tap or pick up a guest and every free seat shows a green tick (fine) or red cross (breaks a rule).
- Portrait badges: side arrow (blue left / red right), up arrow = near the tor, down arrow = by the door, ring = kuda pair, bolt + number = feud, colour dot = nagashy family, house = cousin from the aul.
- Rules unlock hall by hall, and the azhe explains each new one in a speech bubble the first time:
  1. Elders near the tor, young guests off the tor row. 2. Sides.
  3. Kuda face their pair.
  4. The offended relative arrives after their rival and must not sit next to them.
  5. Kids by the door; each kid runs off once and must be reseated.
  6. When every seat is full, a cousin from the aul arrives, a stool appears, and someone must move to it.
  7. Nagashy next to same-colour family. 8. The surprise akim on the tor row.
- Halls: yurt (8 seats, 0 rep), cafe (16, 300), toikhana (24, 1000), saray/palace (24, 2200, shorter patience).
- Feedback: green smile or red "Hm!" bubble over each seated guest; offended guests walk out through the door; the screen shakes when the scandal rises; synthesized "Oibai!" on mistakes, coin clink in Shashu, applause when the asaba arrives and at the end.
- Meta: reputation (sum of toi scores) unlocks halls; the **Aul album** collects every guest type met.
- Stars come from the share of guests seated perfectly and the scandal level (Zhaman / Zhaksy / Uly toishy). A full scandal bar ends the toi.

## Music
- The toi (hall waves): `public/music/toi.mp3`, Dos-Mukasan "Barinen de sen sulu" (rap remix). It starts from the top each wave and plays at 1.1x with 20s left, 1.2x with 10s left.
- Menus (start, leaderboard, profile, final) and Shashu: `public/music/bipyl.mp3`, "Bipyl" (Jamal Omarova, rap remix v2). It plays continuously across menus; Shashu jumps to 0:43.
- Hall intro card and results: the generated dombra chiptune.
- Both songs are re-encoded to 128 kbps. They are third-party recordings: clear the rights before any public release, or swap the files.

## Solana (optional)
- Wallet connect uses the injected Phantom / Solflare providers. On mobile without the extension, it deep-links into the wallet's in-app browser.
- A 3-star wave saves a **Toi Estelygi** snapshot (PNG of the seated table + title + date). **MINT NFT** asks the wallet to sign the image hash, then POSTs `{owner, message, signature, image, metadata}` to `VITE_MINT_API`.
  **No mint service ships with this repo.** Without `VITE_MINT_API`, the signed memento is kept locally and the metadata JSON is downloaded.
- Tenge is tracked off-chain in the local profile. Claiming it as an SPL token needs a server-side mint authority (not included).

## Tutorial, Betashar, Bazaar, sharing
- First **TOI BASTAR!** runs a guided lesson: 4 scripted guests, a pointing hand, azhe tips. Wrong seats are refused without penalty. **?** on the start screen replays it.
- Between halls, **Shashu** (tap falling sweets) alternates with **Betashar**, where the bride bows to 12 relatives on the beat. Taps are judged against the audio clock (±0.09 s perfect, ±0.18 s good), and the veil lifts at the end.
- **Bazaar:** tenge buys tablecloths, feast dishes (baursak, kazy-karta), the UI ornament colour and your look (used as your avatar in My Toi).
- **Share:** result and final screens make a pixel card (with the table snapshot) and send it through the phone's share sheet. On desktop the card is downloaded and Telegram's share page opens.
- Voice: only the azhe's "Oibai!" (macOS Kazakh voice *Aru*, `public/voice/`). The other sounds are synthesized.
- Desktop/laptop: the portrait game sits in the middle of a night-steppe toi (yurts, garlands, fireworks, campfire, dancers). Phones keep the plain frame and respect safe areas.

## Solana setup (devnet)
1. `node scripts/setup-solana.mjs`. This creates `.secrets/authority.json`. It needs about 0.3 devnet SOL on that address; get it at https://faucet.solana.com and re-run.
   It then creates the **TENGE** token (Token-2022, 0 decimals, on-chain name/symbol/icon) and the **Toi Estelygi** Metaplex Core collection, and writes `.env.local`.
2. `npm run dev`: the Vite dev server also serves `api/*` (claims, NFT co-signing, leaderboard) with the secrets from `.env.local`.
3. On Vercel, set `TOI_AUTHORITY_SECRET`, `TENGE_MINT`, `VITE_TENGE_MINT`, `ESTELYGI_COLLECTION` and `VITE_ESTELYGI_COLLECTION` (+ `KV_REST_API_*` for rate limits and leaderboards).

How it fits together:
- **TENGE:** tenge earned in Shashu/Betashar is kept locally until **CLAIM**. The wallet signs `Toi Bastar: claim N TENGE to <wallet> at <ts>`, and `api/tenge-claim` verifies it, blocks replays, caps it (200 per claim, 300 per wallet per day) and mints to the player's token account. Earnings are counted client-side, which is why the caps exist.
- **Shashu in My Toi** is a real `transferChecked` of TENGE to the host's token account. The guestbook reads the amounts from the chain. Without a configured mint it falls back to devnet SOL.
- **Toi Estelygi NFTs** (3-star mementos and My Toi tables): the game sends the PNG + metadata to `api/estelygi`. The server stores them on Arweave via Irys (paid by the authority), builds a Core `create` inside the collection and signs as collection authority. The player's wallet signs once as payer/owner. The browser only loads web3.js.
- Devnet note: Irys **devnet** uploads are temporary (kept for weeks, not forever). For mainnet, point `SOLANA_RPC` at mainnet and the uploader switches to the permanent Irys node.
- Verified end to end on devnet (2026-09-30):
  - claim: 60 TENGE minted to a guest wallet;
  - wish: `transferChecked` of 10 TENGE to the host + memo;
  - guestbook: read back from chain;
  - NFT `Cym2v589…iMSM` minted into collection `CrXpxMRY…THxC`, owned by the host.

## My Toi (social mode, Solana devnet)
- **Host:** Profile -> MY TOI -> CREATE A TOI. The host enters a name and date. The invite link carries the toi (id, name, date, host name, host wallet) in `?toi=`, so no server is needed. The host can **COPY LINK** or share to **TELEGRAM**.
- **Guest:** the link opens a pixel invitation card. The guest picks an avatar and a free seat, chooses shashu (0/1/5/10/25 tenge, 1 tenge = 0.001 devnet SOL) and writes a wish (max 140 characters), then signs **one** transaction:
  `SystemProgram.transfer(guest -> host, shashu)` + `Memo("TOI|id|seat|tenge|avatar|name|wish")`.
  The wallet only signs; the game sends it to devnet itself, so it works whatever network the wallet is set to.
- **Guestbook:** read straight from the host wallet's devnet history (`getSignaturesForAddress` filtered by the toi's memo tag). It shows the table with every guest seated, plus wishes, guest short addresses, shashu (from the actual transfer, not the memo) and Explorer links. The first guest to claim a seat keeps it.
- **Toi Estelygi NFT:** from the toi date on, the host can mint a Metaplex Core asset. The table snapshot + metadata are uploaded to Arweave via Irys devnet (paid in devnet SOL, several wallet prompts). Web3/Metaplex code is lazy-loaded.
- Guests need a little devnet SOL for the fee: the GET TEST SOL button calls the public faucet, and when that is rate-limited it opens faucet.solana.com.
- Dev: `?fakewallet=1` installs a Phantom-shaped wallet backed by a local devnet keypair (dev builds only).

## Leaderboard
`api/leaderboard.ts` is a Vercel Function (GET top 20 / POST score) on Upstash Redis REST.
Boards: `all` and `daily-YYYY-MM-DD` (daily boards expire after 8 days). Set `KV_REST_API_URL` + `KV_REST_API_TOKEN`, or `UPSTASH_REDIS_REST_*`, for example by adding Upstash from the Vercel Marketplace.
Until then, and in `npm run dev`, the client falls back to a per-device board. Scores are validated for shape and range but not signed, so they can be spoofed.
