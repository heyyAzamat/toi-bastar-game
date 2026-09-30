import { defineConfig, loadEnv, type Plugin } from 'vite';

/** Dev only: serve api/*.ts (Vercel-style GET/POST handlers) from the Vite dev server. */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const m = req.url?.match(/^\/api\/([a-z-]+)(\?.*)?$/);
        if (!m) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${m[1]}.ts`);
          const handler = mod[req.method ?? 'GET'];
          if (typeof handler !== 'function') {
            res.statusCode = 405;
            return res.end();
          }
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const body = chunks.length ? Buffer.concat(chunks) : undefined;
          const request = new Request(`http://localhost${req.url}`, {
            method: req.method,
            headers: req.headers as Record<string, string>,
            body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
          });
          const response: Response = await handler(request);
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (e) {
          server.config.logger.error(String(e));
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(e) }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Server-side secrets (TOI_AUTHORITY_SECRET, KV_*) from .env.local for the dev API; only VITE_* reach the client.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  return {
    plugins: [devApi()],
    resolve: {
      // Solana/Metaplex libraries import Node's `buffer`; point them at the browser package.
      alias: { buffer: 'buffer/' },
    },
    define: { global: 'globalThis' },
  };
});
