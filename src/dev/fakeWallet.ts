// DEV ONLY (?fakewallet=1): a Phantom-shaped wallet backed by a devnet keypair kept in localStorage,
// so the My Toi flows can be tested end to end in a browser without the extension.
export async function installFakeWallet() {
  const { Keypair, VersionedTransaction } = await import('@solana/web3.js');
  const { ed25519 } = await import('@noble/curves/ed25519');
  const key = 'dev-fake-wallet';
  const saved = localStorage.getItem(key);
  const kp = saved ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(saved))) : Keypair.generate();
  localStorage.setItem(key, JSON.stringify(Array.from(kp.secretKey)));
  const sign = (tx: any) => {
    if (tx instanceof VersionedTransaction) tx.sign([kp]);
    else tx.partialSign(kp);
    return tx;
  };
  const wallet = {
    isPhantom: true,
    publicKey: null as any,
    async connect() { wallet.publicKey = kp.publicKey; return { publicKey: kp.publicKey }; },
    async disconnect() { wallet.publicKey = null; },
    async signTransaction(tx: any) { return sign(tx); },
    async signAllTransactions(txs: any[]) { return txs.map(sign); },
    async signMessage(m: Uint8Array) { return { signature: ed25519.sign(m, kp.secretKey.slice(0, 32)) }; },
  };
  (window as any).phantom = { solana: wallet };
  console.log('[fakewallet]', kp.publicKey.toBase58());
}
