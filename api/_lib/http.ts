// CORS: the iDos Games build (idos.games) calls this API cross-origin. No cookies are involved, so `*` is safe.
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' };

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors } });

/** CORS preflight; every api/* route re-exports it as OPTIONS. */
export const preflight = () => new Response(null, { status: 204, headers: { ...cors, 'access-control-max-age': '86400' } });
