import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    // Solana/Metaplex libraries import Node's `buffer`; point them at the browser package.
    alias: { buffer: 'buffer/' },
  },
  define: { global: 'globalThis' },
});
