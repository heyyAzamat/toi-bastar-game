// "Share your toi": a pixel result card (with the table snapshot when there is one), sent through the
// system share sheet on phones; elsewhere it's downloaded and Telegram's share page opens.
import { C, canvas, setCtx, rect, box, band, text, textS, textO, img, wrap } from './gfx';
import { STAR, STAR_OFF } from './sprites';
import { t } from './i18n';
import { download } from './storage';

export interface ShareInfo { head: string; title: string; stars: number; score: number; memento?: string | null }

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
}

async function card(info: ShareInfo): Promise<HTMLCanvasElement> {
  const snap = info.memento ? await loadImage(info.memento) : null;
  // The memento PNG is 4x; draw it back at 1x so everything shares one pixel grid.
  const sw = snap ? Math.round(snap.width / 4) : 0;
  const sh = snap ? Math.round(snap.height / 4) : 0;
  const w = 150;
  const h = 96 + (snap ? sh + 6 : 0);
  const [cv, c] = canvas(w, h);
  const prev = setCtx(c);
  rect(0, 0, w, h, C.maroon);
  band(0, 0, w);
  band(0, h - 5, w);
  textO(t('toi') + ' ' + t('bastar'), w / 2, 9, C.gold, 1, 'c');
  textS(info.head, w / 2, 20, C.cream, 1, 'c');
  for (let i = 0; i < 3; i++) img(i < info.stars ? STAR : STAR_OFF, w / 2 - 16 + i * 11 - 4, 32);
  wrap(info.title, 140).slice(0, 1).forEach((l) => textO(l, w / 2, 46, info.stars === 3 ? C.gold : C.cream, 1, 'c'));
  textS(`${t('score')}: ${info.score}`, w / 2, 58, C.gold, 1, 'c');
  if (snap) {
    c.imageSmoothingEnabled = false;
    c.drawImage(snap, (w - sw) / 2, 70, sw, sh);
    box((w - sw) / 2 - 1, 69, sw + 2, sh + 2, C.gold);
  }
  text(location.host || 'toi-bastar', w / 2, h - 16, C.tan, 1, 'c');
  setCtx(prev);
  const [big, bc] = canvas(w * 4, h * 4);
  bc.drawImage(cv, 0, 0, w * 4, h * 4);
  return big;
}

export async function shareResult(info: ShareInfo): Promise<'shared' | 'downloaded'> {
  const big = await card(info);
  const text = `${t('toi')} ${t('bastar')} ${info.title} - ${t('score')} ${info.score}`;
  const url = location.origin + location.pathname;
  const blob: Blob | null = await new Promise((r) => big.toBlob(r, 'image/png'));
  const file = blob ? new File([blob], 'toi-bastar.png', { type: 'image/png' }) : null;
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (file && nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text, url });
      return 'shared';
    } catch {
      // Cancelled: fall through to the download.
    }
  }
  download(big.toDataURL('image/png'), 'toi-bastar.png');
  window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  return 'downloaded';
}
