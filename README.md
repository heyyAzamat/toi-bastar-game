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

Dev-only URL params: `?wave=3` jumps to a wave, `?speed=4` fast-forwards time.

## How it plays
- Guests queue at the bottom (patience 8-12s). Drag them to a cushion; drag seated guests to swap.
- 75s wave timer; when it ends the asaba (toastmaster) arrives and the table is scored. Seat everyone early for a time bonus.
- Seat colours encode the rules: blue = kuieu (groom) side, red = kelin (bride) side, gold trim = seats near the tor, green trim = door-end seats for children.
- Rules: 1 elders near the tor (and no young guest on the tor row), 2 sides, 3 kuda (ring) in gold seats facing their pair, 4 feuding guests (bolt + number) not adjacent, 5 children by the door.
- Waves: yurt 8 seats (rules 1-2), cafe 16 (1-4), toikhana 24 (1-5, plus a surprise akim who needs the tor row).
- Stars come from the share of guests seated perfectly and the skandal level. The titles are Zhaman / Zhaksy / Uly toishy. A full skandal bar ends the toi.
- Shashu between waves: tap falling sweets (score) and coins (tenge, the game token).

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

## Leaderboard
`api/leaderboard.ts` is a Vercel Function (GET top 20 / POST score) on Upstash Redis REST.
Set `KV_REST_API_URL` + `KV_REST_API_TOKEN`, or `UPSTASH_REDIS_REST_*`, for example by adding Upstash from the Vercel Marketplace.
Until then, and in `npm run dev`, the client falls back to a per-device board. Scores are validated for shape and range but not signed, so they can be spoofed.
