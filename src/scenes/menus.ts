// Splash, Start, Shashu, Toi result, Final, Leaderboard, Profile, Album.
import { C, rect, box, text, textS, textO, band, vband, panel, img, wrap, measure, canvas } from '../gfx';
import { Scene, btn, go, type Btn } from '../ui';
import { sfx, playMusic, setMuted, applause } from '../audio';
import { guestSprite, STAR, STAR_OFF, COIN, BIGCOIN, CANDIES, type Kind } from '../sprites';
import { WAVES, dailyChallenge } from '../waves';
import { run, title as titleFor, unlockedHalls, interlude } from '../run';
import { t, nm, nextLang } from '../i18n';
import { profile, saveProfile, addMemento, download, type Memento } from '../storage';
import {
  connectWallet, disconnectWallet, mintMemento, mementoMetadata, shortAddr, hasWallet, isMobile, openInWallet,
} from '../solana';
import { fetchBoard, submitScore, type Entry } from '../leaderboard';
import { askName } from '../modal';

function frameBg() {
  rect(0, 0, 180, 320, C.maroon);
  for (let y = 0; y < 320; y += 6) for (let x = (y / 6) % 2 ? 0 : 3; x < 180; x += 6) rect(x, y, 1, 1, C.red);
  band(0, 0, 180);
  band(0, 315, 180);
  vband(0, 5, 310);
  vband(175, 5, 310);
}

function stars(n: number, cx: number, y: number, scale = 2) {
  const w = 9 * scale + 4;
  for (let i = 0; i < 3; i++) img(i < n ? STAR : STAR_OFF, cx - w * 1.5 + i * w + 2, y, scale);
}

/** Falling confetti in the palette. */
class Confetti {
  bits: { x: number; y: number; vx: number; vy: number; c: string; s: number }[] = [];
  spawn(n: number, x = 90, y = 0, spread = 180) {
    const cols = [C.gold, C.red, C.teal, C.green, C.cream];
    for (let i = 0; i < n; i++) {
      this.bits.push({
        x: x + (Math.random() - 0.5) * spread, y: y - Math.random() * 40,
        vx: (Math.random() - 0.5) * 30, vy: 20 + Math.random() * 40, c: cols[i % cols.length], s: Math.random() * 6,
      });
    }
  }
  update(dt: number) {
    for (const b of this.bits) {
      b.x += (b.vx + Math.sin(b.y / 10 + b.s) * 12) * dt;
      b.y += b.vy * dt;
    }
    this.bits = this.bits.filter((b) => b.y < 330);
  }
  draw() {
    for (const b of this.bits) rect(b.x, b.y, Math.floor(b.y / 7 + b.s) % 2 ? 2 : 1, 2, b.c);
  }
}

const DANCERS: Kind[] = ['aksakal', 'kelin', 'kuda', 'child', 'azhe', 'zhigit', 'kudagi'];

function dancers(time: number, y: number) {
  DANCERS.forEach((k, i) => {
    const hop = Math.floor(time * 4 + i) % 2;
    img(guestSprite(k, i), 14 + i * 22, y - hop * 2, 1);
  });
}

function hallName(idx: number) {
  return t('hall_' + WAVES[idx].hall);
}

// --- Splash: the first tap unlocks sound, so the menu music can start -----------

export class SplashScene extends Scene {
  t = 0;
  update(dt: number) { this.t += dt; }
  onUp() { go('start'); }
  draw() {
    frameBg();
    textO(t('toi'), 90, 70, C.gold, 4, 'c');
    textO(t('bastar'), 90, 104, C.cream, 3, 'c');
    dancers(this.t, 150);
    if (Math.floor(this.t * 2) % 2 === 0) textO(t('tapToStart'), 90, 210, C.gold, 1, 'c');
  }
}

// --- Start -------------------------------------------------------------------

export class StartScene extends Scene {
  t = 0;
  enter() {
    this.build();
    playMusic('bipyl');
  }
  build() {
    this.buttons = [
      btn(20, 140, 140, 22, t('toiBastar'), () => { run.reset(profile.tutorialDone ? 'campaign' : 'tutorial'); go('hall'); }, true),
      btn(161, 8, 14, 14, '?', () => { run.reset('tutorial'); go('hall'); }),
      btn(20, 166, 140, 18, t('daily'), () => { run.reset('daily'); go('hall'); }),
      btn(20, 188, 68, 16, t('ranking'), () => go('board')),
      btn(92, 188, 68, 16, t('album'), () => go('album')),
      btn(20, 208, 140, 16, t('profile'), () => go('profile')),
      btn(20, 230, 68, 14, t(profile.muted ? 'soundOff' : 'soundOn'), () => {
        profile.muted = !profile.muted;
        setMuted(profile.muted);
        saveProfile();
        this.build();
      }),
      btn(92, 230, 68, 14, t('lang'), () => { nextLang(); this.build(); }),
    ];
  }
  update(dt: number) { this.t += dt; }
  draw() {
    frameBg();
    // Shanyrak (yurt crown), slowly turning behind the title.
    const cx = 90, cy = 44;
    for (let r = 34; r > 0; r -= 6) {
      for (let a = 0; a < 48; a++) {
        const ang = (a / 48) * Math.PI * 2 + this.t * 0.2 * (r % 12 ? 1 : -1);
        rect(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r * 0.9, 1, 1, r % 12 === 4 ? C.gold : C.tan);
      }
    }
    textO(t('toi'), 90, 14, C.gold, 4, 'c');
    textO(t('bastar'), 90, 46, C.cream, 3, 'c');
    textS(t('subtitle'), 90, 73, C.gold, 1, 'c');
    dancers(this.t, 86);
    rect(10, 103, 160, 1, C.gold);

    // Reputation toward the next hall.
    textS(t('repN', profile.rep), 20, 108, C.gold);
    textS(`${t('tenge')} ${profile.coins}`, 160, 108, C.cream, 1, 'r');
    const next = WAVES.find((w) => w.rep > profile.rep);
    const prev = [...WAVES].reverse().find((w) => w.rep <= profile.rep)!;
    const frac = next ? (profile.rep - prev.rep) / (next.rep - prev.rep) : 1;
    rect(20, 118, 140, 4, C.brown);
    rect(20, 118, Math.round(140 * frac), 4, C.gold);
    if (Math.floor(this.t * 3) % 4 === 0) rect(20 + Math.round(140 * frac) - 1, 118, 1, 4, C.cream);
    text(next ? t('nextHall', `${hallName(next.idx)} (${next.rep})`) : t('allHalls'), 90, 126, C.tan, 1, 'c');

    this.drawButtons();

    // Hall map: unlocked halls glow, locked ones show their price.
    const open = unlockedHalls();
    WAVES.forEach((w, i) => {
      const x = 14 + i * 39;
      const on = open.includes(w.idx);
      rect(x, 252, 36, 22, on ? C.red : C.brown);
      box(x, 252, 36, 22, on ? C.gold : C.tan);
      textS(String(i + 1), x + 18, 255, on ? C.gold : C.tan, 1, 'c');
      text(on ? String(w.seats) : String(w.rep), x + 18, 264, on ? C.cream : C.tan, 1, 'c');
    });
    text(t('help1'), 90, 283, C.tan, 1, 'c');
    text(t('help2'), 90, 294, C.tan, 1, 'c');
    if (profile.wallet) textS(shortAddr(profile.wallet), 90, 304, C.teal, 1, 'c');
  }
}

// --- Shashu ------------------------------------------------------------------

interface Drop { x: number; y: number; vy: number; kind: 'candy' | 'coin' | 'big'; c: number; sway: number; caught: number }

export class ShashuScene extends Scene {
  t = 0;
  drops: Drop[] = [];
  candies = 0;
  coins = 0;
  spawn = 0;
  pops: { x: number; y: number; s: string; t: number; c: string }[] = [];
  sparks: { x: number; y: number; vx: number; vy: number; t: number; c: string }[] = [];
  confetti = new Confetti();
  done = false;
  enter() {
    this.t = 0;
    this.drops = [];
    this.pops = [];
    this.sparks = [];
    this.candies = 0;
    this.coins = 0;
    this.done = false;
    this.buttons = [btn(30, 236, 120, 18, t('nextToi'), () => { run.wave++; go('hall'); }, true)];
    this.buttons[0].hidden = true;
    // Jump to the song's big section: shashu is the loudest moment of a toi.
    playMusic('bipyl', 43);
  }
  update(dt: number) {
    this.t += dt;
    for (const p of this.pops) { p.t += dt; p.y -= 16 * dt; }
    this.pops = this.pops.filter((p) => p.t < 0.8);
    for (const p of this.sparks) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 100 * dt; }
    this.sparks = this.sparks.filter((p) => p.t < 0.5);
    this.confetti.update(dt);
    if (this.done) return;
    if (this.t >= 10) {
      this.done = true;
      this.drops = [];
      this.buttons[0].hidden = false;
      run.candies += this.candies;
      run.coins += this.coins;
      profile.coins += this.coins;
      saveProfile();
      this.confetti.spawn(60);
      sfx('fanfare');
      return;
    }
    this.spawn -= dt;
    if (this.spawn <= 0) {
      this.spawn = 0.12 + Math.random() * 0.15;
      const r = Math.random();
      this.drops.push({
        x: 12 + Math.random() * 156, y: 36, vy: 45 + Math.random() * 55,
        kind: r < 0.06 ? 'big' : r < 0.4 ? 'coin' : 'candy',
        c: Math.floor(Math.random() * CANDIES.length), sway: Math.random() * 6, caught: 0,
      });
    }
    for (const d of this.drops) {
      d.y += d.vy * dt;
      d.x += Math.sin(this.t * 3 + d.sway) * 12 * dt;
    }
    this.drops = this.drops.filter((d) => d.y < 300 && !d.caught);
  }
  onDown(x: number, y: number) {
    if (this.done) return;
    // Generous hit radius for thumbs; nearest drop wins.
    let best: Drop | null = null;
    let bd = 14;
    for (const d of this.drops) {
      const dist = Math.hypot(d.x - x, d.y - y);
      if (dist < bd) { bd = dist; best = d; }
    }
    if (!best) return;
    best.caught = 1;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.sparks.push({ x: best.x, y: best.y, vx: Math.cos(a) * 40, vy: Math.sin(a) * 40, t: 0, c: best.kind === 'candy' ? C.cream : C.gold });
    }
    if (best.kind === 'candy') {
      this.candies++;
      this.pops.push({ x: best.x, y: best.y, s: '+1', t: 0, c: C.cream });
      sfx('candy');
    } else {
      const v = best.kind === 'big' ? 5 : 1;
      this.coins += v;
      this.pops.push({ x: best.x, y: best.y, s: '+' + t('tengeN', v), t: 0, c: C.gold });
      sfx('coin');
    }
  }
  draw() {
    frameBg();
    textO(t('shashu'), 90, 9, C.gold, 2, 'c');
    // Azhe throwing sweets at the top.
    const arm = Math.floor(this.t * 6) % 2;
    img(guestSprite('azhe', 1), 82, 26 - arm, 1);
    const left = Math.max(0, Math.ceil(10 - this.t));
    textS(String(left), 166, 28, left <= 3 ? C.red : C.cream, 1, 'r');
    for (const d of this.drops) {
      const im = d.kind === 'candy' ? CANDIES[d.c] : d.kind === 'big' ? BIGCOIN : COIN;
      // Coins spin: squash their width on alternate frames.
      const spin = d.kind !== 'candy' && Math.floor(this.t * 8 + d.sway) % 3 === 0;
      if (spin) img(im, d.x - 1, d.y - im.height / 2, 1, 2, im.height);
      else img(im, d.x - im.width / 2, d.y - im.height / 2);
    }
    for (const p of this.sparks) rect(p.x, p.y, 1, 1, p.c);
    for (const p of this.pops) textO(p.s, p.x, p.y, p.c, 1, 'c');
    rect(8, 300, 164, 12, C.brown);
    img(CANDIES[0], 12, 303);
    textS(String(this.candies), 24, 303, C.cream);
    img(COIN, 100, 302);
    textS(t('tengeN', this.coins), 110, 303, C.gold);
    if (this.done) {
      panel(20, 110, 140, 150);
      textO(t('zharaysyn'), 90, 124, C.gold, 2, 'c');
      textS(t('kempitPlus', this.candies), 90, 148, C.cream, 1, 'c');
      textS(t('tengePlus', this.coins), 90, 160, C.gold, 1, 'c');
      text(t('tokenNote1'), 90, 180, C.tan, 1, 'c');
      text(t('tokenNote2'), 90, 190, C.tan, 1, 'c');
    } else if (this.t < 1.5) {
      textO(t('tapSweets'), 90, 150, C.cream, 1, 'c');
    }
    this.confetti.draw();
    this.drawButtons();
  }
}

// --- Result --------------------------------------------------------------------

export interface ResultData {
  wave: number; hall: number; stars: number; title: string; perfect: number; total: number; score: number;
  left: number; kurmet: number; scandal: number; memento: string | null;
}

export class ResultScene extends Scene {
  d!: ResultData;
  t = 0;
  shown = 0;
  status = '';
  memento: Memento | null = null;
  mintBtn!: Btn;
  confetti = new Confetti();
  sparks: { x: number; y: number; vx: number; vy: number; t: number }[] = [];
  enter(d: ResultData) {
    this.d = d;
    this.t = 0;
    this.shown = 0;
    this.status = '';
    this.confetti = new Confetti();
    this.sparks = [];
    const last = run.isLast();
    this.memento = d.memento
      ? { date: new Date().toISOString().slice(0, 10), title: d.title, stars: d.stars, wave: d.hall + 1, png: d.memento }
      : null;
    if (d.stars > 0) {
      run.scores[run.wave] = d.score;
      run.stars[run.wave] = d.stars;
    }
    if (this.memento && d.stars === 3) addMemento(this.memento);
    this.mintBtn = btn(20, 246, 140, 16, t('mint'), () => this.mint());
    this.mintBtn.hidden = d.stars !== 3;
    this.buttons = d.stars === 0
      ? [btn(20, 222, 140, 20, t('retry'), () => go('hall'), true), btn(20, 266, 140, 16, t('menu'), () => go('start'))]
      : [
        btn(20, 222, 140, 20, last ? t('finish') : t(interlude(run.wave)), () => go(last ? 'final' : interlude(run.wave)), true),
        this.mintBtn,
        btn(20, 266, 68, 16, 'PNG', () => this.memento && download(this.memento.png, `toi-estelygi-${d.hall + 1}.png`)),
        btn(92, 266, 68, 16, t('retry'), () => go('hall')),
      ];
    playMusic('menu');
    if (!d.stars) sfx('fail');
  }
  async mint() {
    if (!this.memento) return;
    if (!profile.wallet) {
      this.status = t('needWallet');
      return;
    }
    this.status = t('signing');
    this.mintBtn.disabled = true;
    const r = await mintMemento(this.memento);
    this.mintBtn.disabled = false;
    if (r.ok) {
      this.status = t('minted', shortAddr(r.mint));
      this.mintBtn.hidden = true;
      sfx('fanfare');
    } else if (r.reason === 'no-service') {
      this.status = t('mintOffline');
      download(
        'data:application/json,' + encodeURIComponent(JSON.stringify(mementoMetadata(this.memento, profile.wallet), null, 2)),
        `toi-estelygi-${this.d.hall + 1}.json`,
      );
    } else this.status = r.reason === 'no-wallet' ? t('needWallet') : t('mintFailed');
  }
  update(dt: number) {
    this.t += dt;
    // Stars pop in one by one, each with a ding and a burst.
    const due = Math.min(this.d.stars, Math.floor(this.t * 2.5));
    while (this.shown < due) {
      const x = 90 - 31 + this.shown * 31 + 13;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        this.sparks.push({ x, y: 55, vx: Math.cos(a) * 50, vy: Math.sin(a) * 50, t: 0 });
      }
      this.shown++;
      sfx('star');
      if (this.shown === 3) this.confetti.spawn(70);
    }
    for (const p of this.sparks) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    this.sparks = this.sparks.filter((p) => p.t < 0.5);
    this.confetti.update(dt);
  }
  draw() {
    frameBg();
    const d = this.d;
    const head = run.mode === 'daily' ? t('daily') : t('toiN', d.wave);
    textO(head, 90, 12, C.cream, measure(head, 2) <= 160 ? 2 : 1, 'c');
    textS(`${hallName(d.hall)} - ${t('result')}`, 90, 30, C.gold, 1, 'c');
    stars(this.shown, 90, 42, 3);
    // The newest star is drawn one size bigger for a moment.
    const popT = this.t * 2.5 - (this.shown - 1);
    if (this.shown && popT < 0.35) img(STAR, 90 - 31 * 1.5 + (this.shown - 1) * 31 + 2 - 4, 38, 4);
    for (const p of this.sparks) rect(p.x, p.y, 2, 2, C.gold);
    const tScale = measure(d.title, 2) <= 160 ? 2 : 1;
    if (this.t > 0.4 * Math.max(1, d.stars)) {
      textO(d.title, 90, tScale === 2 ? 76 : 80, d.stars === 3 ? C.gold : d.stars ? C.cream : C.red, tScale, 'c');
    }
    panel(14, 100, 152, 112);
    const rows: [string, string, string][] = [
      [t('seatedWell'), `${d.perfect}/${d.total}`, C.cream],
      [t('leftOffended'), String(d.left), d.left ? C.red : C.cream],
      [t('kurmet'), String(d.kurmet), C.gold],
      [t('scandal'), `${d.scandal}%`, C.red],
      [t('score'), String(Math.round(d.score * Math.min(1, this.t / 1.2))), C.gold],
    ];
    rows.forEach(([k, v, c], i) => {
      text(k, 24, 113 + i * 13, C.cream);
      textS(v, 156, 113 + i * 13, c, 1, 'r');
    });
    if (d.stars === 3) text(t('estelygiSaved'), 90, 192, C.gold, 1, 'c');
    else if (d.stars === 0) text(t('guestsWentHome'), 90, 192, C.tan, 1, 'c');
    else text(t('starsUnlock'), 90, 192, C.tan, 1, 'c');
    this.drawButtons();
    if (this.status) textO(this.status, 90, 290, C.cream, 1, 'c');
    this.confetti.draw();
  }
}

// --- Final ----------------------------------------------------------------------

export class FinalScene extends Scene {
  total = 0;
  starSum = 0;
  isBest = false;
  repGain = 0;
  newHalls: number[] = [];
  t = 0;
  confetti = new Confetti();
  enter() {
    this.t = 0;
    this.total = run.total();
    this.starSum = run.stars.reduce((a, b) => a + b, 0);
    profile.games++;
    profile.stars += this.starSum;
    this.isBest = this.total > profile.best;
    if (this.isBest) profile.best = this.total;
    // Reputation accumulates across every toi and unlocks halls.
    const before = unlockedHalls();
    this.repGain = this.total;
    profile.rep += this.total;
    this.newHalls = unlockedHalls().filter((h) => !before.includes(h));
    if (run.mode === 'daily') {
      const best = profile.daily?.key === run.dailyKey ? profile.daily.best : 0;
      profile.daily = { key: run.dailyKey, best: Math.max(best, this.total) };
      submitScore(this.total, this.starSum, 'daily-' + run.dailyKey);
    } else submitScore(this.total, this.starSum, 'all');
    saveProfile();
    this.buttons = [
      btn(20, 232, 140, 20, t('ranking'), () => go('board', run.mode === 'daily' ? 'daily' : 'all'), true),
      btn(20, 258, 140, 16, t('newToi'), () => { run.reset(run.mode); go('hall'); }),
      btn(20, 280, 140, 16, t('menu'), () => go('start')),
    ];
    this.confetti = new Confetti();
    this.confetti.spawn(90);
    playMusic('bipyl', 43);
    sfx('fanfare');
    applause(3.5);
  }
  update(dt: number) {
    this.t += dt;
    this.confetti.update(dt);
    if (this.t % 1.5 < dt) this.confetti.spawn(20);
  }
  draw() {
    frameBg();
    textO(t('toi'), 90, 8, C.gold, 3, 'c');
    textO(t('over'), 90, 32, C.cream, measure(t('over'), 3) <= 160 ? 3 : 2, 'c');
    dancers(this.t, 58);
    textO(titleFor(Math.max(1, Math.round(this.starSum / run.halls.length))), 90, 77, C.gold, 1, 'c');
    panel(14, 88, 152, 136);
    run.halls.forEach((h, i) => {
      text(run.mode === 'daily' ? t('daily') : hallName(h), 24, 100 + i * 11, C.cream);
      stars(run.stars[i], 122, 99 + i * 11, 1);
    });
    const y = 100 + Math.max(3, run.halls.length) * 11;
    text(t('kempit'), 24, y, C.cream);
    textS(String(run.candies), 156, y, C.cream, 1, 'r');
    text(t('tengeEarned'), 24, y + 10, C.cream);
    textS(String(run.coins), 156, y + 10, C.gold, 1, 'r');
    text(t('totalScore'), 24, y + 21, C.gold);
    textO(String(Math.round(this.total * Math.min(1, this.t / 1.5))), 156, y + 30, C.gold, 2, 'r');
    textS(t('repGain', this.repGain), 24, y + 47, C.gold);
    const blink = Math.floor(this.t * 3) % 2;
    if (this.newHalls.length && blink) textO(t('newHall', hallName(this.newHalls[0])), 90, 214, C.cream, 1, 'c');
    else if (this.isBest && blink) textO(t('newBest'), 90, 214, C.red, 1, 'c');
    this.drawButtons();
    this.confetti.draw();
  }
}

// --- Leaderboard ----------------------------------------------------------------

export class BoardScene extends Scene {
  entries: Entry[] = [];
  online = false;
  loading = true;
  tab: 'all' | 'daily' = 'all';
  enter(tab?: 'all' | 'daily') {
    this.tab = tab ?? 'all';
    this.build();
    playMusic('bipyl');
  }
  build() {
    const tabBtn = (x: number, id: 'all' | 'daily', label: string) => {
      const b = btn(x, 24, 74, 14, label, () => { this.tab = id; this.build(); });
      b.primary = this.tab === id;
      return b;
    };
    this.buttons = [
      tabBtn(14, 'all', t('allTime')),
      tabBtn(92, 'daily', t('today')),
      btn(20, 290, 140, 16, t('back'), () => go('start')),
    ];
    this.loading = true;
    const tab = this.tab;
    fetchBoard(tab === 'all' ? 'all' : 'daily-' + dailyChallenge().key).then(({ entries, online }) => {
      if (tab !== this.tab) return;
      this.entries = entries;
      this.online = online;
      this.loading = false;
    });
  }
  draw() {
    frameBg();
    textO(t('ranking'), 90, 7, C.gold, 2, 'c');
    panel(10, 42, 160, 240);
    if (this.tab === 'daily') text(`${t('daily')}: ${hallName(dailyChallenge().hall)}`, 90, 52, C.gold, 1, 'c');
    if (this.loading) {
      text(t('loading'), 90, 150, C.cream, 1, 'c');
    } else if (!this.entries.length) {
      text(t('emptyBoard'), 90, 150, C.cream, 1, 'c');
    } else {
      this.entries.slice(0, 13).forEach((e, i) => {
        const y = 64 + i * 15;
        const me = e.id === profile.id;
        if (me) rect(14, y - 2, 152, e.wallet ? 17 : 11, C.red);
        const c = i === 0 ? C.gold : C.cream;
        textS(`${i + 1}.`, 26, y, c, 1, 'r');
        textS(nm(e.name.slice(0, 12)), 30, y, c);
        textS(String(e.score), 164, y, C.gold, 1, 'r');
        if (e.wallet) text(shortAddr(e.wallet), 30, y + 8, C.teal);
      });
    }
    if (!this.loading && !this.online) text(t('offline'), 90, 264, C.tan, 1, 'c');
    this.drawButtons();
  }
}

// --- Profile --------------------------------------------------------------------

export class ProfileScene extends Scene {
  status = '';
  enter() {
    this.status = '';
    this.build();
    playMusic('bipyl');
  }
  build() {
    const connected = !!profile.wallet;
    // On a phone without a wallet extension, offer to reopen the game inside the wallet's browser.
    const deeplink = !connected && isMobile() && !hasWallet();
    this.buttons = [
      btn(122, 34, 44, 14, t('edit'), async () => {
        const n = await askName(profile.name);
        if (n) { profile.name = n; saveProfile(); }
      }),
      ...(connected
        ? [btn(20, 148, 140, 16, t('disconnect'), async () => { await disconnectWallet(); this.build(); })]
        : deeplink
          ? [
            btn(20, 140, 140, 16, t('openPhantom'), () => openInWallet('phantom'), true),
            btn(20, 159, 140, 14, t('openSolflare'), () => openInWallet('solflare')),
          ]
          : [
            btn(20, 140, 68, 16, 'PHANTOM', () => this.connect('phantom')),
            btn(92, 140, 68, 16, 'SOLFLARE', () => this.connect('solflare')),
          ]),
      btn(20, 180, 140, 18, t('myToi'), () => go('host'), true),
      btn(20, 290, 140, 16, t('back'), () => go('start')),
    ];
    profile.mementos.slice(-2).reverse().forEach((m, i) => {
      this.buttons.push(btn(130, 228 + i * 20, 34, 14, 'PNG', () => download(m.png, `toi-estelygi-${m.date}.png`)));
    });
  }
  async connect(kind: 'phantom' | 'solflare') {
    if (!hasWallet(kind)) this.status = t('noWallet');
    else this.status = t('connecting');
    try {
      const a = await connectWallet(kind);
      if (a) this.status = t('connected');
    } catch {
      this.status = t('rejected');
    }
    this.build();
  }
  draw() {
    frameBg();
    textO(t('profile'), 90, 7, C.gold, 2, 'c');
    panel(10, 26, 160, 92);
    const nScale = measure(profile.name, 2) <= 100 ? 2 : 1;
    textS(profile.name, 20, nScale === 2 ? 35 : 39, C.cream, nScale);
    const statRows: [string, string][] = [
      [t('rep'), String(profile.rep)],
      [t('tengeToken'), String(profile.coins)],
      [t('bestScore'), String(profile.best)],
      [t('stars'), String(profile.stars)],
      [t('toisHosted'), String(profile.games)],
    ];
    statRows.forEach(([k, v], i) => {
      text(k, 20, 53 + i * 10, C.cream);
      textS(v, 160, 53 + i * 10, C.gold, 1, 'r');
    });

    textS(t('wallet'), 90, 121, C.gold, 1, 'c');
    if (profile.wallet) {
      text(shortAddr(profile.wallet) + ' (' + (profile.walletKind ?? '') + ')', 90, 136, C.teal, 1, 'c');
    } else if (isMobile() && !hasWallet()) {
      text(t('noWallet'), 90, 131, C.tan, 1, 'c');
    }
    if (this.status) text(this.status, 90, 202, C.cream, 1, 'c');

    textS(t('estelygi'), 90, 212, C.gold, 1, 'c');
    const ms = profile.mementos.slice(-2).reverse();
    if (!ms.length) {
      for (const [i, l] of wrap(t('noMementos'), 150).entries()) {
        text(l, 90, 224 + i * 9, C.tan, 1, 'c');
      }
    }
    ms.forEach((m, i) => {
      const y = 232 + i * 20;
      box(14, y - 6, 152, 19, C.gold);
      text(`${m.date} H${m.wave}`, 18, y - 4, C.cream);
      text(m.mint ? t('mintedTag') : m.signature ? t('signedTag') : m.title, 18, y + 4, m.mint ? C.teal : C.gold);
    });
    this.drawButtons();
  }
}

// --- Aul album: every guest type the player has met ----------------------------

const ALBUM: Kind[] = ['aksakal', 'azhe', 'kuda', 'kudagi', 'zhigit', 'kelin', 'nagashy', 'child', 'renzhigen', 'bauyr', 'akim', 'asaba'];

const silhouettes = new Map<Kind, HTMLCanvasElement>();
function silhouette(k: Kind) {
  let s = silhouettes.get(k);
  if (!s) {
    const [cv, c] = canvas(16, 16);
    c.drawImage(guestSprite(k), 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = C.brown;
    c.fillRect(0, 0, 16, 16);
    silhouettes.set(k, (s = cv));
  }
  return s;
}

export class AlbumScene extends Scene {
  sel: Kind | null = null;
  t = 0;
  enter() {
    this.sel = null;
    this.buttons = [btn(20, 290, 140, 16, t('back'), () => go('start'))];
  }
  update(dt: number) { this.t += dt; }
  cell(i: number) {
    return { x: 12 + (i % 3) * 53, y: 36 + Math.floor(i / 3) * 52 };
  }
  onDown(x: number, y: number) {
    ALBUM.forEach((k, i) => {
      const c = this.cell(i);
      if (x >= c.x && x < c.x + 50 && y >= c.y && y < c.y + 50) {
        this.sel = k;
        sfx('pick');
      }
    });
  }
  draw() {
    frameBg();
    textO(t('albumTitle'), 90, 7, C.gold, measure(t('albumTitle'), 2) <= 160 ? 2 : 1, 'c');
    const got = ALBUM.filter((k) => profile.album[k]).length;
    text(t('collected', `${got}/${ALBUM.length}`), 90, 25, C.cream, 1, 'c');
    ALBUM.forEach((k, i) => {
      const { x, y } = this.cell(i);
      const met = !!profile.album[k];
      rect(x, y, 50, 50, met ? C.red : C.brown);
      box(x, y, 50, 50, this.sel === k ? C.cream : met ? C.gold : C.tan);
      const hop = met && Math.floor(this.t * 3 + i) % 6 === 0 ? 1 : 0;
      img(met ? guestSprite(k) : silhouette(k), x + 9, y + 1 - hop, 2);
      const lines = met ? wrap(t('k_' + k), 48) : ['?'];
      lines.slice(0, 2).forEach((l, j) => text(l, x + 25, y + 34 + j * 8, met ? C.cream : C.tan, 1, 'c'));
    });
    if (this.sel) {
      const k = this.sel;
      const met = profile.album[k] ?? 0;
      rect(12, 246, 156, 40, C.brown);
      box(12, 246, 156, 40, C.gold);
      if (met) {
        textS(t('k_' + k), 16, 250, C.gold);
        textS(t('met', met), 164, 250, C.cream, 1, 'r');
        wrap(t('d_' + k), 148).slice(0, 3).forEach((l, i) => text(l, 16, 260 + i * 8, C.cream));
      } else text(t('notMet'), 90, 262, C.tan, 1, 'c');
    }
    this.drawButtons();
  }
}
