// "My Toi": host a toi (invite link), guests take a seat + throw shashu + leave a wish on Solana devnet,
// the host reads the on-chain guestbook and mints a Toi Estelygi NFT after the toi date.
import { C, rect, box, text, textS, textO, band, vband, panel, img, wrap, measure } from '../gfx';
import { Scene, btn, go } from '../ui';
import { sfx, playMusic, applause } from '../audio';
import { COIN, CANDIES, guestSprite } from '../sprites';
import { t, nm } from '../i18n';
import { profile, saveProfile, download } from '../storage';
import { connectWallet, shortAddr, hasWallet, isMobile, openInWallet } from '../solana';
import { askText } from '../modal';
import { claimTenge, onchainTenge, tengeEnabled } from '../tenge';
import { verify } from '../verify';
import { makeInvite, inviteUrl, telegramUrl, showDate, todayIso, type ToiInvite } from '../toi/link';
import { fetchWishes, seating, sendWish, airdrop, explorerTx, explorerAddr, type Wish } from '../toi/chain';
import { ToiTable, AVATARS, avatarSprite } from '../toi/table';
import { mintEstelygi } from '../toi/nft';

function ornamentFrame() {
  rect(0, 0, 180, 320, C.maroon);
  for (let y = 0; y < 320; y += 6) for (let x = (y / 6) % 2 ? 0 : 3; x < 180; x += 6) rect(x, y, 1, 1, C.red);
  band(0, 0, 180);
  band(0, 315, 180);
  vband(0, 5, 310);
  vband(175, 5, 310);
}

const open = (url: string) => window.open(url, '_blank', 'noopener');

async function copy(s: string) {
  try {
    await navigator.clipboard.writeText(s);
    return true;
  } catch {
    return false;
  }
}

/** Falling shashu: candies and coins. */
class Shower {
  drops: { x: number; y: number; vy: number; coin: boolean; c: number; s: number }[] = [];
  pour(n: number) {
    for (let i = 0; i < n; i++) {
      this.drops.push({
        x: 10 + Math.random() * 160, y: -Math.random() * 120, vy: 50 + Math.random() * 60,
        coin: Math.random() < 0.45, c: Math.floor(Math.random() * CANDIES.length), s: Math.random() * 6,
      });
    }
  }
  update(dt: number, clock: number) {
    for (const d of this.drops) {
      d.y += d.vy * dt;
      d.x += Math.sin(clock * 3 + d.s) * 10 * dt;
    }
    this.drops = this.drops.filter((d) => d.y < 330);
  }
  draw() {
    for (const d of this.drops) img(d.coin ? COIN : CANDIES[d.c], d.x, d.y);
  }
}

// --- Host: create a toi, list my tois ------------------------------------------------

export class HostScene extends Scene {
  status = '';
  t = 0;
  enter() {
    this.status = '';
    this.build();
    playMusic('bipyl');
  }
  update(dt: number) { this.t += dt; }
  build() {
    const wallet = !!profile.wallet;
    const deeplink = !wallet && isMobile() && !hasWallet();
    this.buttons = [btn(20, 290, 140, 16, t('back'), () => go('profile'))];
    if (!wallet) {
      this.buttons.push(...(deeplink
        ? [btn(20, 110, 140, 16, t('openPhantom'), () => openInWallet('phantom'), true)]
        : [
          btn(20, 110, 68, 16, 'PHANTOM', () => this.connect('phantom')),
          btn(92, 110, 68, 16, 'SOLFLARE', () => this.connect('solflare')),
        ]));
      return;
    }
    this.buttons.push(btn(20, 60, 140, 20, t('newMyToi'), () => this.create(), true));
    profile.hosted.slice(-6).reverse().forEach((inv, i) => {
      this.buttons.push(btn(14, 112 + i * 28, 152, 24, '', () => go('guestbook', inv)));
    });
  }
  async connect(kind: 'phantom' | 'solflare') {
    this.status = hasWallet(kind) ? t('connecting') : t('noWallet');
    try {
      await connectWallet(kind);
    } catch {
      this.status = t('rejected');
    }
    this.build();
  }
  async create() {
    const name = await askText({ max: 40, placeholder: t('toiNameQ') });
    if (!name) return;
    const week = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const date = (await askText({ type: 'date', value: week })) ?? week;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !profile.wallet) return;
    const inv = makeInvite(name, date, profile.name, profile.wallet, profile.equip.avatar);
    profile.hosted.push(inv);
    saveProfile();
    sfx('fanfare');
    go('guestbook', inv);
  }
  draw() {
    ornamentFrame();
    textO(t('myToi'), 90, 9, C.gold, measure(t('myToi'), 2) <= 160 ? 2 : 1, 'c');
    text(t('devnetNote'), 90, 27, C.tan, 1, 'c');
    if (!profile.wallet) {
      wrap(t('hostNeedsWallet'), 150).forEach((l, i) => text(l, 90, 60 + i * 9, C.cream, 1, 'c'));
      if (this.status) text(this.status, 90, 140, C.cream, 1, 'c');
      img(guestSprite('kuda'), 74, 170, 2);
      this.drawButtons();
      return;
    }
    textS(t('myTois'), 90, 96, C.gold, 1, 'c');
    const list = profile.hosted.slice(-6).reverse();
    if (!list.length) text(t('noTois'), 90, 130, C.tan, 1, 'c');
    this.drawButtons();
    list.forEach((inv, i) => {
      const y = 112 + i * 28;
      textS(inv.n.slice(0, 26), 20, y + 4, C.cream);
      text(showDate(inv.d), 20, y + 14, C.gold);
      text('>', 158, y + 9, C.gold, 1, 'r');
    });
  }
}

// --- Guestbook: the host's view ---------------------------------------------------

export class GuestbookScene extends Scene {
  inv!: ToiInvite;
  table!: ToiTable;
  wishes: Wish[] = [];
  seats = new Map<number, Wish>();
  loading = true;
  error = '';
  tab: 'table' | 'wishes' = 'table';
  page = 0;
  status = '';
  clock = 0;
  minting = false;
  enter(inv: ToiInvite) {
    this.inv = inv;
    this.table = new ToiTable(inv);
    this.tab = 'table';
    this.page = 0;
    this.status = '';
    this.build();
    this.load();
    playMusic('bipyl');
  }
  async load() {
    this.loading = true;
    this.error = '';
    try {
      this.wishes = await fetchWishes(this.inv);
      this.seats = seating(this.wishes);
    } catch (e: any) {
      this.error = String(e?.message ?? e).slice(0, 40);
    }
    this.loading = false;
    this.build();
  }
  pages() { return Math.max(1, Math.ceil(this.wishes.length / 3)); }
  build() {
    const tabBtn = (x: number, id: 'table' | 'wishes', label: string) => {
      const b = btn(x, 20, 74, 12, label, () => { this.tab = id; this.build(); });
      b.primary = this.tab === id;
      return b;
    };
    const canMint = todayIso() >= this.inv.d;
    const mint = btn(20, 274, 140, 15, canMint ? t('mintToi') : t('mintAfter', showDate(this.inv.d)), () => this.mint());
    mint.disabled = !canMint || this.minting || !this.wishes.length;
    this.buttons = [
      tabBtn(14, 'table', t('tabTable')),
      tabBtn(92, 'wishes', t('tabWishes', this.wishes.length)),
      btn(14, 256, 74, 15, t('copyLink'), async () => {
        this.status = (await copy(inviteUrl(this.inv))) ? t('copied') : inviteUrl(this.inv).slice(0, 36);
      }),
      btn(92, 256, 74, 15, 'TELEGRAM', () => open(telegramUrl(this.inv, `${t('invitation')}: ${this.inv.n} - ${showDate(this.inv.d)}`))),
      mint,
      btn(14, 294, 74, 14, t('back'), () => go('host')),
      btn(92, 294, 74, 14, t('refresh'), () => this.load()),
    ];
    if (this.tab === 'wishes' && this.pages() > 1) {
      this.buttons.push(btn(14, 232, 20, 14, '<', () => { this.page = (this.page + this.pages() - 1) % this.pages(); }));
      this.buttons.push(btn(146, 232, 20, 14, '>', () => { this.page = (this.page + 1) % this.pages(); }));
    }
  }
  async mint() {
    if (this.minting) return;
    this.minting = true;
    this.build();
    const snap = this.table.snapshot(this.seats);
    const inv = this.inv;
    const r = await mintEstelygi(snap.png, {
      name: `Toi Estelygi: ${inv.n}`,
      description: `${inv.n}, ${inv.d}. Hosted by ${inv.h} in Toi Bastar!`,
      attributes: [
        { trait_type: 'Toi', value: inv.n },
        { trait_type: 'Date', value: inv.d },
        { trait_type: 'Host', value: inv.h },
        { trait_type: 'Guests', value: this.seats.size },
      ],
    }, (s) => { this.status = s === 'upload' ? t('uploading') : t('mintingNft'); });
    this.minting = false;
    if (r.ok) {
      this.status = t('minted', shortAddr(r.asset));
      sfx('fanfare');
      applause();
      open(explorerAddr(r.asset));
    } else {
      this.status = r.reason === 'no-wallet' ? t('needWallet') : t('sendFailed', r.detail ?? '');
      download(snap.dataUrl, `toi-estelygi-${this.inv.id}.png`);
    }
    this.build();
  }
  onDown(x: number, y: number) {
    if (this.tab !== 'wishes') return;
    // Tap a wish to open its transaction in Solana Explorer.
    const i = Math.floor((y - 40) / 64);
    const w = this.wishes[this.page * 3 + i];
    if (w && y >= 40 && y < 232 && x > 10 && x < 170) open(explorerTx(w.sig));
  }
  update(dt: number) { this.clock += dt; }
  draw() {
    this.table.draw(this.seats, this.clock);
    rect(0, 0, 180, 34, C.brown);
    band(0, 0, 180);
    textS(this.inv.n.slice(0, 30), 90, 7, C.cream, 1, 'c');
    rect(0, 33, 180, 1, C.gold);
    if (this.tab === 'wishes') {
      panel(8, 36, 164, 214);
      if (this.loading) text(t('loading'), 90, 130, C.cream, 1, 'c');
      else if (!this.wishes.length) wrap(t('noWishes'), 140).forEach((l, i) => text(l, 90, 120 + i * 9, C.cream, 1, 'c'));
      this.wishes.slice(this.page * 3, this.page * 3 + 3).forEach((w, i) => {
        const y = 46 + i * 64;
        img(avatarSprite(w.avatar), 14, y);
        textS(nm(w.name), 34, y, C.cream);
        text(shortAddr(w.guest), 166, y, C.teal, 1, 'r');
        text(`+${t('tengeN', w.tenge)}`, 34, y + 9, C.gold);
        text('TX >', 166, y + 9, C.tan, 1, 'r');
        wrap(w.wish, 150).slice(0, 4).forEach((l, j) => text(l, 14, y + 20 + j * 9, C.cream));
        if (i < 2) rect(14, y + 60, 152, 1, C.tan);
      });
      if (this.pages() > 1) text(`${this.page + 1}/${this.pages()}`, 90, 235, C.gold, 1, 'c');
    } else if (this.loading) textO(t('loading'), 90, 140, C.cream, 1, 'c');
    if (this.error) textO(this.error, 90, 150, C.red, 1, 'c');
    rect(0, 252, 180, 68, C.maroon);
    band(0, 252, 180, C.gold, C.maroon);
    this.drawButtons();
    if (this.status) textO(this.status, 90, 243, C.cream, 1, 'c');
  }
}

// --- Invite: the guest's view -----------------------------------------------------

type Step = 'card' | 'seat' | 'gift' | 'sending' | 'done' | 'bad';

export class InviteScene extends Scene {
  inv!: ToiInvite;
  table!: ToiTable;
  step: Step = 'card';
  seats = new Map<number, Wish>();
  loaded = false;
  mySeat = -1;
  avatar = 'kelin0';
  hop = 0;
  tenge = 0;
  wish = '';
  status = '';
  sig = '';
  clock = 0;
  shower = new Shower();
  balance: number | null = null; // TENGE the guest can throw (on-chain when the token is set up)
  enter(inv: ToiInvite | 'bad') {
    this.clock = 0;
    this.status = '';
    this.shower = new Shower();
    if (inv === 'bad') {
      this.step = 'bad';
      this.buttons = [btn(20, 240, 140, 18, t('playGame'), () => go('splash'), true)];
      return;
    }
    this.inv = inv;
    this.table = new ToiTable(inv);
    this.step = 'card';
    this.mySeat = -1;
    this.balance = null;
    this.avatar = profile.equip.avatar;
    this.tenge = 0;
    this.wish = '';
    this.loaded = false;
    fetchWishes(inv).then((w) => { this.seats = seating(w); this.loaded = true; }).catch(() => { this.loaded = true; });
    this.build();
    playMusic('bipyl');
  }
  build() {
    if (this.step === 'card') {
      this.buttons = [btn(30, 236, 120, 20, t('accept'), () => { this.step = 'seat'; this.build(); }, true)];
    } else if (this.step === 'seat') {
      const next = btn(92, 294, 74, 16, t('next'), () => { this.step = 'gift'; this.build(); }, true);
      next.disabled = this.mySeat < 0;
      this.buttons = [btn(14, 294, 74, 16, t('back'), () => { this.step = 'card'; this.build(); }), next];
    } else if (this.step === 'gift') {
      if (this.balance === null) this.loadBalance();
      const amounts = [0, 1, 5, 10, 25];
      this.buttons = amounts.map((a, i) => {
        const b = btn(14 + i * 31, 96, 28, 16, String(a), () => { this.tenge = a; this.build(); });
        b.primary = this.tenge === a;
        b.disabled = a > (this.balance ?? 0);
        return b;
      });
      this.buttons.push(btn(20, 150, 140, 16, t('writeWish'), async () => {
        const w = await askText({ type: 'area', max: 140, value: this.wish, placeholder: t('wishQ') });
        if (w !== null) this.wish = w;
        this.build(); // enables SEND once there is a wish
      }));
      this.buttons.push(btn(122, 62, 44, 14, t('edit'), async () => {
        const n = await askText({ value: profile.name, max: 12, upper: true });
        if (n) { profile.name = n; saveProfile(); }
      }));
      if (!profile.wallet) {
        const deeplink = isMobile() && !hasWallet();
        this.buttons.push(...(deeplink
          ? [btn(20, 236, 140, 18, t('openPhantom'), () => openInWallet('phantom'), true)]
          : [
            btn(20, 236, 68, 18, 'PHANTOM', () => this.connect('phantom'), true),
            btn(92, 236, 68, 18, 'SOLFLARE', () => this.connect('solflare'), true),
          ]));
      } else {
        const send = btn(20, 236, 140, 20, t('send'), () => this.send(), true);
        send.disabled = !this.wish;
        this.buttons.push(send, btn(20, 260, 68, 14, t('getSol'), () => this.getSol()));
        const claim = btn(92, 260, 68, 14, t('claim', Math.min(200, profile.coins)), () => this.claim());
        claim.disabled = !tengeEnabled() || profile.coins < 1;
        this.buttons.push(claim);
      }
      this.buttons.push(btn(14, 294, 74, 16, t('back'), () => { this.step = 'seat'; this.build(); }));
    } else if (this.step === 'done') {
      this.buttons = [
        btn(20, 236, 140, 18, t('explorer'), () => open(explorerTx(this.sig)), true),
        btn(20, 260, 140, 16, t('playGame'), () => go('splash')),
      ];
    } else this.buttons = [];
  }
  /** On-chain TENGE when the token is set up; otherwise the local balance (shashu then goes as devnet SOL). */
  loadBalance() {
    if (!tengeEnabled()) {
      this.balance = profile.coins;
      return;
    }
    if (!profile.wallet) {
      this.balance = 0;
      return;
    }
    onchainTenge(profile.wallet).then((n) => {
      const changed = n !== this.balance;
      this.balance = n;
      if (changed && this.step === 'gift') this.build();
    }).catch(() => { this.balance = 0; });
  }
  async claim() {
    this.status = t('signing');
    // The server mints only what it counted from verified tois.
    const r = await claimTenge((await verify.balance()) ?? 0);
    this.status = r.ok ? t('claimed', r.amount) : r.reason === 'limit' ? t('claimLimit') : r.reason === 'nothing' ? t('notEnough') : t('sendFailed', (r as any).detail ?? r.reason);
    this.balance = null;
    this.build();
  }
  async connect(kind: 'phantom' | 'solflare') {
    this.status = hasWallet(kind) ? t('connecting') : t('noWallet');
    try {
      if (await connectWallet(kind)) this.status = '';
      this.balance = null;
    } catch {
      this.status = t('rejected');
    }
    this.build();
  }
  async getSol() {
    if (!profile.wallet) return;
    this.status = t('loading');
    if (await airdrop(profile.wallet)) this.status = t('airdropOk');
    else {
      this.status = t('airdropFail');
      open('https://faucet.solana.com/');
    }
  }
  async send() {
    this.step = 'sending';
    this.build();
    this.status = t('sending');
    const r = await sendWish(this.inv, this.mySeat, this.tenge, this.avatar, this.wish);
    if (r.ok) {
      this.sig = r.sig;
      // Local tenge is spent only when shashu went as devnet SOL; TENGE left the wallet on-chain.
      if (!tengeEnabled()) {
        profile.coins -= this.tenge;
        saveProfile();
      }
      this.step = 'done';
      this.status = '';
      this.shower.pour(30 + this.tenge * 4);
      sfx('coin');
      applause(2.5);
    } else {
      this.step = 'gift';
      this.status = r.reason === 'no-sol' ? t('needSol') : r.reason === 'no-tenge' ? t('noTengeWallet') : r.reason === 'rejected' ? t('rejected') : t('sendFailed', r.detail ?? '');
    }
    this.build();
  }
  onDown(x: number, y: number) {
    if (this.step !== 'seat') return;
    // Avatar picker row.
    if (y >= 38 && y < 58) {
      const i = Math.floor((x - 10) / 20);
      if (i >= 0 && i < AVATARS.length) {
        const v = this.avatar === `${AVATARS[i]}0` ? 1 : 0; // tap again for the other outfit
        this.avatar = `${AVATARS[i]}${v}`;
        sfx('pick');
      }
      return;
    }
    const s = this.table.seatAt(x, y);
    if (s < 0) return;
    if (this.seats.has(s)) {
      this.status = t('seatTaken');
      sfx('bad');
      return;
    }
    this.mySeat = s;
    this.hop = 0.35;
    this.status = '';
    sfx('good');
    this.build();
  }
  update(dt: number) {
    this.clock += dt;
    this.hop = Math.max(0, this.hop - dt);
    this.shower.update(dt, this.clock);
    if (this.step === 'done' && Math.floor(this.clock * 2) !== Math.floor((this.clock - dt) * 2) && this.shower.drops.length < 20) this.shower.pour(6);
  }
  drawCard() {
    ornamentFrame();
    // The invitation card: cream paper with koshkar muiz corners.
    rect(19, 29, 144, 196, C.brown);
    rect(18, 28, 144, 196, C.cream);
    box(20, 30, 140, 192, C.gold);
    band(22, 32, 136, C.maroon, C.cream);
    band(22, 215, 136, C.maroon, C.cream);
    textO(t('invitation'), 90, 44, C.gold, measure(t('invitation'), 2) <= 130 ? 2 : 1, 'c');
    const lines = wrap(this.inv.n, 124, 1);
    lines.slice(0, 4).forEach((l, i) => textS(l, 90, 70 + i * 10, C.maroon, 1, 'c', C.gold));
    const y = 74 + Math.min(4, lines.length) * 10;
    text(t('hostIs', this.inv.h), 90, y + 4, C.brown, 1, 'c');
    textS(showDate(this.inv.d), 90, y + 16, C.red, 2, 'c', C.gold);
    for (let i = 0; i < 5; i++) {
      const hop = Math.floor(this.clock * 4 + i) % 2;
      img(avatarSprite(AVATARS[i] + (i % 2)), 42 + i * 20, 178 - hop * 2);
    }
    if (this.loaded) text(`${this.seats.size}/16`, 90, 200, C.tan, 1, 'c');
    text(t('devnetNote'), 90, 262, C.tan, 1, 'c');
  }
  draw() {
    if (this.step === 'bad') {
      ornamentFrame();
      wrap(t('badLink'), 140).forEach((l, i) => textO(l, 90, 130 + i * 10, C.red, 1, 'c'));
      this.drawButtons();
      return;
    }
    if (this.step === 'card') {
      this.drawCard();
      this.drawButtons();
      return;
    }
    if (this.step === 'seat') {
      this.table.draw(this.seats, this.clock, { seat: this.mySeat, avatar: this.avatar, hop: this.hop });
      rect(0, 0, 180, 34, C.brown);
      band(0, 0, 180);
      textS(t('pickAvatar'), 90, 7, C.gold, 1, 'c');
      text(t('avatarHint'), 90, 19, C.tan, 1, 'c');
      rect(0, 34, 180, 26, C.maroon);
      AVATARS.forEach((k, i) => {
        const x = 12 + i * 20;
        const on = this.avatar.startsWith(k);
        if (on) rect(x - 2, 38, 20, 20, C.gold);
        img(on ? avatarSprite(this.avatar) : guestSprite(k), x, 40);
      });
      rect(0, 60, 180, 1, C.gold);
      rect(0, 252, 180, 68, C.maroon);
      band(0, 252, 180);
      textO(this.mySeat < 0 ? t('pickSeat') : t('youHere'), 90, 262, C.cream, 1, 'c');
      if (!this.loaded) text(t('loading'), 90, 274, C.tan, 1, 'c');
      if (this.status) textO(this.status, 90, 280, C.red, 1, 'c');
      this.drawButtons();
      return;
    }
    // gift / sending / done
    ornamentFrame();
    textO(this.inv.n.slice(0, 24), 90, 10, C.gold, 1, 'c');
    img(avatarSprite(this.avatar), 20, 58, 2);
    textS(profile.name, 56, 64, C.cream);
    if (this.step !== 'done') {
      textS(t('throwShashu'), 90, 28, C.cream, 1, 'c');
      text(this.balance === null ? t('loading') : t('yourTenge', this.balance), 90, 84, C.tan, 1, 'c');
      text(t('wishQ'), 90, 124, C.gold, 1, 'c');
      rect(14, 134, 152, 12, C.brown);
      text(this.wish ? `${this.wish.length}/140` : '-', 90, 137, C.cream, 1, 'c');
      wrap(this.wish, 150).slice(0, 5).forEach((l, i) => text(l, 16, 172 + i * 9, C.cream));
      text(profile.wallet ? shortAddr(profile.wallet) : t('wallet'), 90, 222, C.teal, 1, 'c');
    } else {
      textO(t('sent'), 90, 110, C.gold, 1, 'c');
      text(`+${t('tengeN', this.tenge)}`, 90, 124, C.cream, 1, 'c');
      wrap(this.wish, 150).slice(0, 5).forEach((l, i) => text(l, 90, 140 + i * 9, C.cream, 1, 'c'));
    }
    this.drawButtons();
    if (this.status) wrap(this.status, 160).slice(0, 2).forEach((l, i) => textO(l, 90, 278 + i * 9, this.step === 'sending' ? C.cream : C.red, 1, 'c'));
    this.shower.draw();
  }
}
