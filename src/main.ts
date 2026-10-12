import { setCtx, W, H } from './gfx';
import { initBackdrop, layoutBackdrop, drawBackdrop, setBackdropOrigin } from './backdrop';
import { register, go, current, transitioning, updateTransition, drawTransition } from './ui';
import { unlockAudio, setMuted } from './audio';
import { HallScene } from './scenes/hall';
import { SplashScene, StartScene, ShashuScene, ResultScene, FinalScene, BoardScene, ProfileScene, AlbumScene } from './scenes/menus';
import { profile, loadMementos } from './storage';
import { restoreWallet } from './solana';
import { input, run } from './run';
import { HostScene, GuestbookScene, InviteScene } from './scenes/toi';
import { BetasharScene } from './scenes/betashar';
import { ShopScene } from './scenes/shop';
import { applyCosmetics } from './shop';
import { readInvite } from './toi/link';
import { idos } from './idos';

const cv = document.getElementById('c') as HTMLCanvasElement;
setCtx(cv.getContext('2d')!);

// Integer scaling in *device* pixels so every game pixel is an exact square.
// Phones: the game fills the safe area (notch, home bar) and follows the address bar via visualViewport.
// Wide screens: the game stays portrait in the middle and the backdrop fills the sides.
let scale = 1;
const bg = document.getElementById('bg') as HTMLCanvasElement;
initBackdrop(bg);

function insets() {
  const cs = getComputedStyle(document.documentElement);
  const px = (v: string) => parseFloat(cs.getPropertyValue(v)) || 0;
  return { t: px('--sat'), r: px('--sar'), b: px('--sab'), l: px('--sal') };
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const vv = window.visualViewport;
  const vw = vv ? vv.width : innerWidth;
  const vh = vv ? vv.height : innerHeight;
  const i = insets();
  const aw = Math.max(180, vw - i.l - i.r);
  const ah = Math.max(320, vh - i.t - i.b);
  scale = Math.max(1, Math.floor(Math.min((aw * dpr) / W, (ah * dpr) / H)));
  const cssW = (W * scale) / dpr;
  const cssH = (H * scale) / dpr;
  layoutBackdrop(scale, dpr);
  // Snap the game onto the backdrop's pixel grid so the ornament frame lines up exactly.
  const cell = scale / dpr;
  const left = i.l + Math.round((aw - cssW) / 2 / cell) * cell;
  const top = i.t + Math.round((ah - cssH) / 2 / cell) * cell;
  cv.style.width = `${cssW}px`;
  cv.style.height = `${cssH}px`;
  cv.style.left = `${left}px`;
  cv.style.top = `${top}px`;
  setBackdropOrigin(Math.round(left / cell), Math.round(top / cell));
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 150));
window.visualViewport?.addEventListener('resize', resize);
resize();

function toGame(e: PointerEvent): [number, number] {
  const r = cv.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
}

// Browsers only allow sound after a user gesture; iOS counts touchend/click, not pointerdown.
for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
  document.addEventListener(ev, unlockAudio, { capture: true, passive: true });
}

cv.addEventListener('pointerdown', (e) => {
  cv.setPointerCapture(e.pointerId);
  input.touch = e.pointerType === 'touch';
  input.liftY = input.touch ? 16 : 6;
  if (!transitioning()) current.down(...toGame(e));
});
cv.addEventListener('pointermove', (e) => {
  // A mouse hovering before its first click should already get hover tooltips.
  input.touch = e.pointerType === 'touch';
  current.move(...toGame(e));
});
cv.addEventListener('pointerup', (e) => current.up(...toGame(e)));
cv.addEventListener('pointercancel', (e) => current.up(...toGame(e)));
cv.addEventListener('contextmenu', (e) => e.preventDefault());

register('splash', new SplashScene());
register('start', new StartScene());
register('hall', new HallScene());
register('shashu', new ShashuScene());
register('result', new ResultScene());
register('final', new FinalScene());
register('board', new BoardScene());
register('profile', new ProfileScene());
register('album', new AlbumScene());
register('host', new HostScene());
register('guestbook', new GuestbookScene());
register('invite', new InviteScene());
register('betashar', new BetasharScene());
register('shop', new ShopScene());

// Dev only: ?speed=N fast-forwards time; window.__scene exposes the active scene.
const speed = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('speed')) || 1 : 1;
if (import.meta.env.DEV) (window as any).__scene = () => current;

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000) * speed;
  last = now;
  // Hidden tab = paused toi: patience and the wave timer stop.
  if (!document.hidden) {
    updateTransition(dt);
    if (!transitioning()) current.update(dt);
  }
  current.draw();
  drawTransition();
  drawBackdrop(now / 1000, dt / speed);
  requestAnimationFrame(frame);
}

async function boot() {
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('fakewallet')) {
    const { installFakeWallet } = await import('./dev/fakeWallet');
    await installFakeWallet();
  }
  setMuted(profile.muted);
  applyCosmetics();
  restoreWallet();
  loadMementos();
  const devWave = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('wave')) : 0;
  const devScene = import.meta.env.DEV ? new URLSearchParams(location.search).get('scene') : null;
  if (devScene) {
    run.reset();
    go(devScene);
  } else if (devWave >= 1 && devWave <= 4) {
    run.reset();
    run.halls = [devWave - 1];
    run.scores = [0];
    run.stars = [0];
    go('hall');
  } else {
    // An invite link opens straight on the invitation card.
    const invite = readInvite();
    if (invite) go('invite', invite);
    else go('splash');
  }
  requestAnimationFrame(frame);
  // Sign in to the iDos Games platform in the background, once the game is already on screen.
  setTimeout(() => void idos(), 1500);
}
boot();
