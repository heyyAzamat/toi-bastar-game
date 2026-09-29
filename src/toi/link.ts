// "My Toi" invites. Everything a guest needs is in the link itself (no server):
// the toi's id, name, date, host name and the host wallet that receives the wishes.
export interface ToiInvite {
  v: 1;
  id: string; // 8 chars, tags every memo of this toi
  n: string; // toi name
  d: string; // YYYY-MM-DD
  h: string; // host name
  w: string; // host wallet (base58)
}

const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function toB64Url(s: string) {
  let bin = '';
  new TextEncoder().encode(s).forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(s: string) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function makeInvite(name: string, date: string, host: string, wallet: string): ToiInvite {
  const id = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
  return { v: 1, id, n: name.slice(0, 40), d: date, h: host.slice(0, 12), w: wallet };
}

export function inviteUrl(inv: ToiInvite) {
  return `${location.origin}${location.pathname}?toi=${toB64Url(JSON.stringify(inv))}`;
}

export function telegramUrl(inv: ToiInvite, text: string) {
  return `https://t.me/share/url?url=${encodeURIComponent(inviteUrl(inv))}&text=${encodeURIComponent(text)}`;
}

function valid(x: any): x is ToiInvite {
  return x && x.v === 1 && /^[a-z0-9]{8}$/.test(x.id) && typeof x.n === 'string' && x.n.length <= 40
    && /^\d{4}-\d{2}-\d{2}$/.test(x.d) && typeof x.h === 'string' && x.h.length <= 12 && B58.test(x.w);
}

/** The invite in the current URL: an invite object, 'bad' for a broken link, or null. */
export function readInvite(): ToiInvite | 'bad' | null {
  const raw = new URLSearchParams(location.search).get('toi');
  if (!raw) return null;
  try {
    const inv = JSON.parse(fromB64Url(raw));
    return valid(inv) ? inv : 'bad';
  } catch {
    return 'bad';
  }
}

export const showDate = (d: string) => d.split('-').reverse().join('.');
export const todayIso = () => new Date().toISOString().slice(0, 10);
