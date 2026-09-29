// Start, Shashu, Toi result, Final, Leaderboard, Profile.
import { C, rect, box, text, textS, textO, band, vband, panel, img, wrap } from '../gfx';
import { Scene, btn, go, type Btn } from '../ui';
import { sfx, playMusic, setMuted } from '../audio';
import { guestSprite, STAR, STAR_OFF, COIN, BIGCOIN, CANDIES, type Kind } from '../sprites';
import { WAVES } from '../waves';
import { run, TITLES } from '../run';
import { profile, saveProfile, addMemento, download, type Memento } from '../storage';
import { connectWallet, disconnectWallet, mintMemento, mementoMetadata, shortAddr } from '../solana';
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

// --- Start -------------------------------------------------------------------

const DANCERS: Kind[] = ['aksakal', 'kelin', 'kuda', 'child', 'azhe', 'zhigit', 'kudagi'];

export class StartScene extends Scene {
  t = 0;
  mute!: Btn;
  enter() {
    this.mute = btn(20, 262, 140, 14, '', () => {
      profile.muted = !profile.muted;
      setMuted(profile.muted);
      saveProfile();
      this.label();
    });
    this.buttons = [
      btn(20, 170, 140, 22, 'TOI BASTAR!', () => { run.reset(); go('hall'); }, true),
      btn(20, 200, 140, 18, 'REYTING', () => go('board')),
      btn(20, 224, 140, 18, 'PROFIL', () => go('profile')),
      this.mute,
    ];
    this.label();
    playMusic('song');
  }
  label() { this.mute.label = profile.muted ? 'DYBYS: OFF' : 'DYBYS: ON'; }
  update(dt: number) { this.t += dt; }
  draw() {
    frameBg();
    // Shanyrak (yurt crown) behind the title.
    const cx = 90, cy = 62;
    for (let r = 34; r > 0; r -= 6) {
      for (let a = 0; a < 64; a++) {
        const ang = (a / 64) * Math.PI * 2;
        rect(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r * 0.9, 1, 1, r % 12 === 4 ? C.gold : C.tan);
      }
    }
    textO('TOI', 90, 38, C.gold, 4, 'c');
    textO('BASTAR!', 90, 62, C.cream, 3, 'c');
    textS('KAZAKH WEDDING SEATING PUZZLE', 90, 88, C.gold, 1, 'c');

    // Dancing guests.
    DANCERS.forEach((k, i) => {
      const hop = Math.floor(this.t * 4 + i) % 2;
      img(guestSprite(k, i), 14 + i * 22, 118 - hop * 2, 1);
    });
    rect(10, 134, 160, 2, C.gold);
    textS(`TENGE ${profile.coins}`, 20, 146, C.gold);
    textS(`BEST ${profile.best}`, 160, 146, C.cream, 1, 'r');
    if (profile.wallet) textS(shortAddr(profile.wallet), 90, 156, C.teal, 1, 'c');
    this.drawButtons();
    text('DRAG GUESTS TO THEIR SEATS', 90, 288, C.tan, 1, 'c');
    text('BEFORE THE ASABA ARRIVES', 90, 296, C.tan, 1, 'c');
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
  done = false;
  enter() {
    this.t = 0;
    this.drops = [];
    this.pops = [];
    this.candies = 0;
    this.coins = 0;
    this.done = false;
    this.buttons = [btn(30, 236, 120, 18, 'KELESI TOI', () => { run.wave++; go('hall'); }, true)];
    this.buttons[0].hidden = true;
    // Jump to the song's big section: shashu is the loudest moment of a toi.
    playMusic('song', 43);
  }
  update(dt: number) {
    this.t += dt;
    for (const p of this.pops) { p.t += dt; p.y -= 16 * dt; }
    this.pops = this.pops.filter((p) => p.t < 0.8);
    if (this.done) return;
    if (this.t >= 10) {
      this.done = true;
      this.drops = [];
      this.buttons[0].hidden = false;
      run.candies += this.candies;
      run.coins += this.coins;
      profile.coins += this.coins;
      saveProfile();
      sfx('fanfare');
      return;
    }
    this.spawn -= dt;
    if (this.spawn <= 0) {
      this.spawn = 0.12 + Math.random() * 0.15;
      const r = Math.random();
      this.drops.push({
        x: 12 + Math.random() * 156, y: 30, vy: 45 + Math.random() * 55,
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
    if (best.kind === 'candy') {
      this.candies++;
      this.pops.push({ x: best.x, y: best.y, s: '+1', t: 0, c: C.cream });
      sfx('candy');
    } else {
      const v = best.kind === 'big' ? 5 : 1;
      this.coins += v;
      this.pops.push({ x: best.x, y: best.y, s: `+${v} TENGE`, t: 0, c: C.gold });
      sfx('coin');
    }
  }
  draw() {
    frameBg();
    textO('SHASHU!', 90, 12, C.gold, 2, 'c');
    // Azhe throwing sweets at the top.
    const arm = Math.floor(this.t * 6) % 2;
    img(guestSprite('azhe', 1), 82, 26 - arm, 1);
    const left = Math.max(0, Math.ceil(10 - this.t));
    textS(String(left), 166, 28, left <= 3 ? C.red : C.cream, 1, 'r');
    for (const d of this.drops) {
      const im = d.kind === 'candy' ? CANDIES[d.c] : d.kind === 'big' ? BIGCOIN : COIN;
      img(im, d.x - im.width / 2, d.y - im.height / 2);
    }
    for (const p of this.pops) textO(p.s, p.x, p.y, p.c, 1, 'c');
    rect(8, 300, 164, 12, C.brown);
    img(CANDIES[0], 12, 303);
    textS(String(this.candies), 24, 304, C.cream);
    img(COIN, 100, 302);
    textS(`${this.coins} TENGE`, 110, 304, C.gold);
    if (this.done) {
      panel(20, 110, 140, 150);
      textO('ZHARAYSYN!', 90, 126, C.gold, 2, 'c');
      textS(`KEMPIT +${this.candies}`, 90, 150, C.cream, 1, 'c');
      textS(`TENGE +${this.coins}`, 90, 162, C.gold, 1, 'c');
      text('TENGE IS THE TOI TOKEN.', 90, 184, C.tan, 1, 'c');
      text('SEE IT IN YOUR PROFIL.', 90, 192, C.tan, 1, 'c');
    } else if (this.t < 1.5) {
      textO('TAP THE SWEETS!', 90, 150, C.cream, 1, 'c');
    }
    this.drawButtons();
  }
}

// --- Result --------------------------------------------------------------------

export interface ResultData {
  wave: number; stars: number; title: string; perfect: number; total: number; score: number;
  left: number; kurmet: number; scandal: number; memento: string | null;
}

export class ResultScene extends Scene {
  d!: ResultData;
  t = 0;
  status = '';
  memento: Memento | null = null;
  mintBtn!: Btn;
  enter(d: ResultData) {
    this.d = d;
    this.t = 0;
    this.status = '';
    const last = d.wave === WAVES.length;
    this.memento = d.memento
      ? { date: new Date().toISOString().slice(0, 10), title: d.title, stars: d.stars, wave: d.wave, png: d.memento }
      : null;
    if (d.stars > 0) {
      run.scores[d.wave - 1] = d.score;
      run.stars[d.wave - 1] = d.stars;
    }
    if (this.memento && d.stars === 3) addMemento(this.memento);
    this.mintBtn = btn(20, 246, 140, 16, 'MINT NFT', () => this.mint());
    this.mintBtn.hidden = d.stars !== 3;
    this.buttons = d.stars === 0
      ? [btn(20, 222, 140, 20, 'QAITA', () => go('hall'), true), btn(20, 266, 140, 16, 'MENU', () => go('start'))]
      : [
        btn(20, 222, 140, 20, last ? 'AYAQTAU' : 'SHASHU!', () => go(last ? 'final' : 'shashu'), true),
        this.mintBtn,
        btn(20, 266, 68, 16, 'PNG', () => this.memento && download(this.memento.png, `toi-estelygi-${d.wave}.png`)),
        btn(92, 266, 68, 16, 'QAITA', () => go('hall')),
      ];
    playMusic('menu');
    sfx(d.stars ? 'star' : 'fail');
  }
  async mint() {
    if (!this.memento) return;
    if (!profile.wallet) {
      this.status = 'CONNECT A WALLET IN PROFIL';
      return;
    }
    this.status = 'SIGN IN YOUR WALLET...';
    this.mintBtn.disabled = true;
    const r = await mintMemento(this.memento);
    this.mintBtn.disabled = false;
    if (r.ok) {
      this.status = 'MINTED! ' + shortAddr(r.mint);
      this.mintBtn.hidden = true;
      sfx('fanfare');
    } else if (r.reason === 'no-service') {
      this.status = 'SIGNED. MINT SERVICE OFFLINE';
      download(
        'data:application/json,' + encodeURIComponent(JSON.stringify(mementoMetadata(this.memento, profile.wallet), null, 2)),
        `toi-estelygi-${this.d.wave}.json`,
      );
    } else this.status = r.reason === 'no-wallet' ? 'CONNECT A WALLET IN PROFIL' : 'MINT FAILED';
  }
  update(dt: number) { this.t += dt; }
  draw() {
    frameBg();
    const d = this.d;
    textO(`TOI ${d.wave}`, 90, 16, C.cream, 2, 'c');
    textS('NATIZHESI', 90, 32, C.gold, 1, 'c');
    const shown = Math.min(d.stars, Math.floor(this.t * 2.5));
    stars(shown, 90, 46, 3);
    textO(d.title, 90, 84, d.stars === 3 ? C.gold : d.stars ? C.cream : C.red, d.title.length > 11 ? 1 : 2, 'c');
    panel(14, 100, 152, 112);
    const rows: [string, string, string][] = [
      ['SEATED WELL', `${d.perfect}/${d.total}`, C.cream],
      ['LEFT OFFENDED', String(d.left), d.left ? C.red : C.cream],
      ['KURMET', String(d.kurmet), C.gold],
      ['SKANDAL', `${d.scandal}%`, C.red],
      ['SCORE', String(d.score), C.gold],
    ];
    rows.forEach(([k, v, c], i) => {
      text(k, 24, 116 + i * 12, C.cream);
      textS(v, 156, 116 + i * 12, c, 1, 'r');
    });
    if (d.stars === 3) text('TOI ESTELYGI SAVED!', 90, 192, C.gold, 1, 'c');
    else if (d.stars === 0) text('THE GUESTS WENT HOME...', 90, 192, C.tan, 1, 'c');
    else text('3 STARS UNLOCK THE NFT', 90, 192, C.tan, 1, 'c');
    this.drawButtons();
    if (this.status) textO(this.status, 90, 290, C.cream, 1, 'c');
  }
}

// --- Final ----------------------------------------------------------------------

export class FinalScene extends Scene {
  total = 0;
  starSum = 0;
  isBest = false;
  t = 0;
  enter() {
    this.t = 0;
    this.total = run.total();
    this.starSum = run.stars.reduce((a, b) => a + b, 0);
    profile.games++;
    profile.stars += this.starSum;
    this.isBest = this.total > profile.best;
    if (this.isBest) profile.best = this.total;
    saveProfile();
    submitScore(this.total, this.starSum);
    this.buttons = [
      btn(20, 232, 140, 20, 'REYTING', () => go('board'), true),
      btn(20, 258, 140, 16, 'ZHANA TOI', () => { run.reset(); go('hall'); }),
      btn(20, 280, 140, 16, 'MENU', () => go('start')),
    ];
    playMusic('song');
    sfx('fanfare');
  }
  update(dt: number) { this.t += dt; }
  draw() {
    frameBg();
    textO('TOI', 90, 20, C.gold, 3, 'c');
    textO('BITTI!', 90, 42, C.cream, 3, 'c');
    const title = TITLES[Math.max(1, Math.round(this.starSum / 3))];
    textO(title, 90, 72, C.gold, 1, 'c');
    panel(14, 86, 152, 136);
    run.stars.forEach((s, i) => {
      text(`TOI ${i + 1}`, 24, 102 + i * 16, C.cream);
      stars(s, 118, 99 + i * 16, 1);
    });
    text('KEMPIT', 24, 152, C.cream);
    textS(String(run.candies), 156, 152, C.cream, 1, 'r');
    text('TENGE EARNED', 24, 164, C.cream);
    textS(String(run.coins), 156, 164, C.gold, 1, 'r');
    text('TOTAL SCORE', 24, 180, C.gold);
    textO(String(this.total), 156, 190, C.gold, 2, 'r');
    if (this.isBest && Math.floor(this.t * 3) % 2) textO('NEW BEST!', 90, 208, C.red, 1, 'c');
    this.drawButtons();
  }
}

// --- Leaderboard ----------------------------------------------------------------

export class BoardScene extends Scene {
  entries: Entry[] = [];
  online = false;
  loading = true;
  enter() {
    this.loading = true;
    this.buttons = [btn(20, 290, 140, 16, 'ARTQA', () => go('start'))];
    playMusic('song');
    fetchBoard().then(({ entries, online }) => {
      this.entries = entries;
      this.online = online;
      this.loading = false;
    });
  }
  draw() {
    frameBg();
    textO('REYTING', 90, 12, C.gold, 2, 'c');
    textS('BEST TOISHY', 90, 28, C.cream, 1, 'c');
    panel(10, 38, 160, 244);
    if (this.loading) {
      text('ZHUKTELUDE...', 90, 150, C.cream, 1, 'c');
    } else if (!this.entries.length) {
      text('NO TOI YET. BE THE FIRST!', 90, 150, C.cream, 1, 'c');
    } else {
      this.entries.slice(0, 15).forEach((e, i) => {
        const y = 52 + i * 14;
        const me = e.id === profile.id;
        if (me) rect(14, y - 3, 152, 11, C.red);
        const c = i === 0 ? C.gold : C.cream;
        textS(`${i + 1}.`, 26, y, c, 1, 'r');
        textS(e.name.slice(0, 12), 30, y, c);
        textS(String(e.score), 164, y, C.gold, 1, 'r');
        if (e.wallet) text(shortAddr(e.wallet), 30, y + 6, C.teal);
      });
    }
    if (!this.loading && !this.online) text('OFFLINE: THIS DEVICE ONLY', 90, 264, C.tan, 1, 'c');
    this.drawButtons();
  }
}

// --- Profile --------------------------------------------------------------------

export class ProfileScene extends Scene {
  status = '';
  enter() {
    this.status = '';
    this.build();
    playMusic('song');
  }
  build() {
    const w = !!profile.wallet;
    this.buttons = [
      btn(128, 34, 38, 14, 'EDIT', async () => {
        const n = await askName(profile.name);
        if (n) { profile.name = n; saveProfile(); }
      }),
      ...(w
        ? [btn(20, 150, 140, 16, 'DISCONNECT', async () => { await disconnectWallet(); this.build(); })]
        : [
          btn(20, 140, 68, 16, 'PHANTOM', () => this.connect('phantom')),
          btn(92, 140, 68, 16, 'SOLFLARE', () => this.connect('solflare')),
        ]),
      btn(20, 290, 140, 16, 'ARTQA', () => go('start')),
    ];
    profile.mementos.slice(-3).reverse().forEach((m, i) => {
      this.buttons.push(btn(130, 204 + i * 20, 34, 14, 'PNG', () => download(m.png, `toi-estelygi-${m.date}.png`)));
    });
  }
  async connect(kind: 'phantom' | 'solflare') {
    this.status = 'CONNECTING...';
    try {
      const a = await connectWallet(kind);
      this.status = a ? 'ZHARAYSYN! CONNECTED' : 'OPENING WALLET APP...';
    } catch {
      this.status = 'CONNECTION REJECTED';
    }
    this.build();
  }
  draw() {
    frameBg();
    textO('PROFIL', 90, 12, C.gold, 2, 'c');
    panel(10, 26, 160, 92);
    textS(profile.name, 20, 38, C.cream, 2);
    const stats: [string, string][] = [
      ['TENGE (TOKEN)', String(profile.coins)],
      ['BEST SCORE', String(profile.best)],
      ['STARS', String(profile.stars)],
      ['TOIS HOSTED', String(profile.games)],
    ];
    stats.forEach(([k, v], i) => {
      text(k, 20, 60 + i * 11, C.cream);
      textS(v, 160, 60 + i * 11, C.gold, 1, 'r');
    });

    textS('SOLANA WALLET', 90, 126, C.gold, 1, 'c');
    if (profile.wallet) {
      text(shortAddr(profile.wallet) + ' (' + (profile.walletKind ?? '') + ')', 90, 138, C.teal, 1, 'c');
    }
    if (this.status) text(this.status, 90, 172, C.cream, 1, 'c');

    textS('TOI ESTELYGI', 90, 186, C.gold, 1, 'c');
    const ms = profile.mementos.slice(-3).reverse();
    if (!ms.length) {
      for (const [i, l] of wrap('GET 3 STARS IN A TOI TO EARN A TABLE SNAPSHOT YOU CAN MINT.', 150).entries()) {
        text(l, 90, 200 + i * 8, C.tan, 1, 'c');
      }
    }
    ms.forEach((m, i) => {
      const y = 208 + i * 20;
      box(14, y - 4, 152, 16, C.gold);
      text(`${m.date} H${m.wave}`, 18, y - 1, C.cream);
      text(m.mint ? 'MINTED' : m.signature ? 'SIGNED' : m.title, 18, y + 6, m.mint ? C.teal : C.gold);
    });
    this.drawButtons();
  }
}
