// One-time devnet setup: authority keypair, the TENGE token (Token-2022 + on-chain metadata) and the
// Toi Estelygi Metaplex Core collection. Icons and metadata go to Arweave via Irys (devnet).
// Usage: node scripts/setup-solana.mjs      (re-running skips whatever already exists in .env.local)
import fs from 'node:fs';
import zlib from 'node:zlib';
import { Connection, Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import {
  ExtensionType, TOKEN_2022_PROGRAM_ID, LENGTH_SIZE, TYPE_SIZE, getMintLen,
  createInitializeMetadataPointerInstruction, createInitializeMintInstruction,
} from '@solana/spl-token';
import { createInitializeInstruction, pack } from '@solana/spl-token-metadata';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createGenericFile, createSignerFromKeypair, generateSigner, signerIdentity } from '@metaplex-foundation/umi';
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys';
import { createCollection, mplCore } from '@metaplex-foundation/mpl-core';

const RPC = process.env.SOLANA_RPC ?? 'https://api.devnet.solana.com';
const KEY_FILE = '.secrets/authority.json';
const ENV_FILE = '.env.local';
const conn = new Connection(RPC, 'confirmed');

// --- tiny PNG encoder for the pixel-art icons ---------------------------------------------------
function png(w, h, px) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) px(x, y).forEach((v, i) => (raw[y * (w * 4 + 1) + 1 + x * 4 + i] = v));
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
const P = { maroon: hex('#7A1E2B'), gold: hex('#E8B64C'), cream: hex('#F4E9D3'), brown: hex('#3B2418'), tan: hex('#B5793A'), none: [0, 0, 0, 0] };

/** 16x16 gold coin with the tenge sign, scaled 16x. */
function tengeIcon() {
  return png(256, 256, (X, Y) => {
    const x = Math.floor(X / 16), y = Math.floor(Y / 16);
    const d = Math.hypot(x - 7.5, y - 7.5);
    if (d > 7.6) return P.none;
    if (d > 6.6) return P.brown;
    const sign = ((y === 4 || y === 6) && x >= 4 && x <= 11) || ((x === 7 || x === 8) && y >= 6 && y <= 12);
    if (sign) return P.brown;
    return x + y < 8 ? P.cream : x + y > 18 ? P.tan : P.gold;
  });
}

/** 32x32 koshkar-muiz frame around a gold star, scaled 8x. */
function collectionImage() {
  const orn = ['.gg..gg.', 'g..gg..g', 'g.g..g.g', '.g.gg.g.', '...gg...'];
  return png(256, 256, (X, Y) => {
    const x = Math.floor(X / 8), y = Math.floor(Y / 8);
    const edge = Math.min(x, y, 31 - x, 31 - y);
    if (edge < 5) {
      const along = edge === y || edge === 31 - y ? x : y;
      const across = edge;
      return orn[across][along % 8] === 'g' ? P.gold : P.maroon;
    }
    const dx = Math.abs(x - 15.5), dy = y - 15.5;
    const star = dx + Math.abs(dy) * 0.6 < 5 || (Math.abs(dy) < 1.5 && dx < 8);
    return star ? P.gold : P.maroon;
  });
}

// --- env file ------------------------------------------------------------------------------
function readEnv() {
  if (!fs.existsSync(ENV_FILE)) return {};
  return Object.fromEntries(fs.readFileSync(ENV_FILE, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
}
function writeEnv(env) {
  fs.writeFileSync(ENV_FILE, Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });
}

async function main() {
  fs.mkdirSync('.secrets', { recursive: true, mode: 0o700 });
  let auth;
  if (fs.existsSync(KEY_FILE)) auth = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'))));
  else {
    auth = Keypair.generate();
    fs.writeFileSync(KEY_FILE, JSON.stringify(Array.from(auth.secretKey)), { mode: 0o600 });
  }
  console.log('Authority:', auth.publicKey.toBase58());
  let bal = await conn.getBalance(auth.publicKey);
  if (bal < 0.3 * LAMPORTS_PER_SOL) {
    try {
      const sig = await conn.requestAirdrop(auth.publicKey, LAMPORTS_PER_SOL);
      await conn.confirmTransaction(sig, 'confirmed');
      bal = await conn.getBalance(auth.publicKey);
    } catch {}
  }
  console.log('Balance:', bal / LAMPORTS_PER_SOL, 'SOL (devnet)');
  if (bal < 0.3 * LAMPORTS_PER_SOL) {
    console.log(`\nNeed at least 0.3 devnet SOL. Get some at https://faucet.solana.com for:\n  ${auth.publicKey.toBase58()}\nthen run this script again.`);
    process.exit(1);
  }

  const env = readEnv();
  env.TOI_AUTHORITY_SECRET = JSON.stringify(Array.from(auth.secretKey));
  const umi = createUmi(RPC).use(mplCore()).use(irysUploader({ address: 'https://devnet.irys.xyz' }));
  umi.use(signerIdentity(createSignerFromKeypair(umi, umi.eddsa.createKeypairFromSecretKey(auth.secretKey))));

  if (!env.TENGE_MINT) {
    console.log('Uploading TENGE icon + metadata...');
    const [image] = await umi.uploader.upload([createGenericFile(tengeIcon(), 'tenge.png', { contentType: 'image/png' })]);
    const uri = await umi.uploader.uploadJson({
      name: 'Toi Tenge', symbol: 'TENGE', description: 'Shashu coins from Toi Bastar!, the Kazakh wedding seating game.', image,
    });
    const mint = Keypair.generate();
    const metadata = { mint: mint.publicKey, name: 'Toi Tenge', symbol: 'TENGE', uri, additionalMetadata: [['game', 'Toi Bastar!']] };
    const mintLen = getMintLen([ExtensionType.MetadataPointer]);
    const metaLen = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;
    const lamports = await conn.getMinimumBalanceForRentExemption(mintLen + metaLen);
    const tx = new Transaction().add(
      SystemProgram.createAccount({ fromPubkey: auth.publicKey, newAccountPubkey: mint.publicKey, space: mintLen, lamports, programId: TOKEN_2022_PROGRAM_ID }),
      createInitializeMetadataPointerInstruction(mint.publicKey, auth.publicKey, mint.publicKey, TOKEN_2022_PROGRAM_ID),
      createInitializeMintInstruction(mint.publicKey, 0, auth.publicKey, null, TOKEN_2022_PROGRAM_ID),
      createInitializeInstruction({
        programId: TOKEN_2022_PROGRAM_ID, metadata: mint.publicKey, updateAuthority: auth.publicKey, mint: mint.publicKey,
        mintAuthority: auth.publicKey, name: metadata.name, symbol: metadata.symbol, uri,
      }),
    );
    const sig = await sendAndConfirmTransaction(conn, tx, [auth, mint]);
    env.TENGE_MINT = env.VITE_TENGE_MINT = mint.publicKey.toBase58();
    writeEnv(env);
    console.log('TENGE mint:', env.TENGE_MINT, ' tx', sig);
  } else console.log('TENGE mint exists:', env.TENGE_MINT);

  if (!env.ESTELYGI_COLLECTION) {
    console.log('Uploading collection image + metadata...');
    const [image] = await umi.uploader.upload([createGenericFile(collectionImage(), 'estelygi.png', { contentType: 'image/png' })]);
    const uri = await umi.uploader.uploadJson({
      name: 'Toi Estelygi', symbol: 'TOI', description: 'Pixel mementos of tois hosted in Toi Bastar!', image,
    });
    const collection = generateSigner(umi);
    await createCollection(umi, { collection, name: 'Toi Estelygi', uri }).sendAndConfirm(umi);
    env.ESTELYGI_COLLECTION = env.VITE_ESTELYGI_COLLECTION = collection.publicKey.toString();
    writeEnv(env);
    console.log('Collection:', env.ESTELYGI_COLLECTION);
  } else console.log('Collection exists:', env.ESTELYGI_COLLECTION);

  writeEnv(env);
  console.log(`\nDone. ${ENV_FILE} updated. For Vercel, set the same variables:
  vercel env add TOI_AUTHORITY_SECRET   (value from ${ENV_FILE}, keep it secret)
  vercel env add TENGE_MINT / VITE_TENGE_MINT       ${env.TENGE_MINT}
  vercel env add ESTELYGI_COLLECTION / VITE_ESTELYGI_COLLECTION   ${env.ESTELYGI_COLLECTION}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
