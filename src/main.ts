import { setCtx, W, H } from './gfx';
import { register, go, current, transitioning, updateTransition, drawTransition } from './ui';
import { unlockAudio, setMuted } from './audio';
import { HallScene } from './scenes/hall';
import { SplashScene, StartScene, ShashuScene, ResultScene, FinalScene, BoardScene, ProfileScene, AlbumScene } from './scenes/menus';
import { profile } from './storage';
import { restoreWallet } from './solana';
import { input, run } from './run';
import { HostScene, GuestbookScene, InviteScene } from './scenes/toi';
import { readInvite } from './toi/link';

const cv = document.getElementById('c') as HTMLCanvasElement;
setCtx(cv.getContext('2d')!);

// Integer scaling in *device* pixels so every game pixel is an exact square.
let scale = 1;
function resize() {
  const dpr = window.devicePixelRatio || 1;
  scale = Math.max(1, Math.floor(Math.min((innerWidth * dpr) / W, (innerHeight * dpr) / H)));
  cv.style.width = `${(W * scale) / dpr}px`;
  cv.style.height = `${(H * scale) / dpr}px`;
}
addEventListener('resize', resize);
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
  input.liftY = e.pointerType === 'touch' ? 16 : 6;
  if (!transitioning()) current.down(...toGame(e));
});
cv.addEventListener('pointermove', (e) => current.move(...toGame(e)));
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
  requestAnimationFrame(frame);
}

async function boot() {
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('fakewallet')) {
    const { installFakeWallet } = await import('./dev/fakeWallet');
    await installFakeWallet();
  }
  setMuted(profile.muted);
  restoreWallet();
  const devWave = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('wave')) : 0;
  if (devWave >= 1 && devWave <= 4) {
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
}
boot();
