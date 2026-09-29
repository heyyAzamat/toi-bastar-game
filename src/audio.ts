// Chiptune dombra: a two-string pluck (melody + fourth-tuned drone) and a dauylpaz thump.

let ac: AudioContext | null = null;
let master: GainNode;
let musicBus: GainNode;
let sfxBus: GainNode;
let noise: AudioBuffer;
let muted = false;

// Recorded songs: "Bipyl" (rap remix) for menus and Shashu, Dos-Mukasan "Barinen de sen sulu"
// (rap remix) for the toi itself. The chiptune remains for the hall intro and results.
const SONGS = { bipyl: 'music/bipyl.mp3', toi: 'music/toi.mp3' } as const;
type Song = keyof typeof SONGS;
interface SongPlayer { el: HTMLAudioElement; gain: GainNode; pause?: number }
const players: Partial<Record<Song, SongPlayer>> = {};

export type Track = 'menu' | 'game' | Song | 'none';
const isSong = (t: Track): t is Song => t in SONGS;
let track: Track = 'none';
let bpm = 120;
let step = 0;
let nextTime = 0;
let timer: number | undefined;

export function unlockAudio() {
  if (!ac) {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return;
    ac = new Ctor();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.7;
    master.connect(ac.destination);
    musicBus = ac.createGain();
    musicBus.gain.value = 0.55;
    musicBus.connect(master);
    sfxBus = ac.createGain();
    sfxBus.gain.value = 0.8;
    sfxBus.connect(master);
    noise = ac.createBuffer(1, ac.sampleRate * 0.3, ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    if (isSong(track)) startSong(track);
    else if (track !== 'none') startScheduler();
  }
  if (ac.state === 'suspended') ac.resume();
}

export function setMuted(m: boolean) {
  muted = m;
  if (ac) master.gain.setTargetAtTime(m ? 0 : 0.7, ac.currentTime, 0.02);
}

function pluck(freq: number, t: number, dur: number, vol: number, type: OscillatorType, bus: GainNode) {
  if (!ac) return;
  const o = ac.createOscillator();
  o.type = type;
  // Strings go slightly sharp on attack, then settle: gives the dombra "twang".
  o.frequency.setValueAtTime(freq * 1.015, t);
  o.frequency.exponentialRampToValueAtTime(freq, t + 0.04);
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(3500, t);
  f.frequency.exponentialRampToValueAtTime(500, t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f).connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function thump(t: number, vol: number) {
  if (!ac) return;
  const o = ac.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  o.connect(g).connect(musicBus);
  o.start(t);
  o.stop(t + 0.2);
  const n = ac.createBufferSource();
  n.buffer = noise;
  const f = ac.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 1800;
  const ng = ac.createGain();
  ng.gain.setValueAtTime(vol * 0.25, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  n.connect(f).connect(ng).connect(musicBus);
  n.start(t);
  n.stop(t + 0.06);
}

// A natural minor with a raised 6th flavour, spanning ~1.5 octaves.
const SCALE = [0, 2, 3, 5, 7, 9, 10, 12, 14, 15, 17];
const ROOT = 220;
const note = (i: number) => ROOT * Math.pow(2, SCALE[i] / 12);

// Kui-like phrases: running figures that return to the tonic. -1 = rest.
const PHRASES = [
  [4, 2, 4, 2, 5, 4, 2, 0, 4, 2, 4, 5, 7, 5, 4, 2],
  [0, 2, 3, 2, 4, 3, 2, 0, 2, 0, 1, 2, 0, -1, 0, -1],
  [7, 5, 7, 8, 7, 5, 4, 5, 4, 2, 4, 5, 4, 2, 0, -1],
  [0, -1, 2, 0, 3, 2, 0, -1, 4, 3, 2, 1, 0, -1, 0, -1],
];

function playStep(s: number, t: number) {
  const i = s % 16;
  const bar = Math.floor(s / 16);
  const dur = Math.min(0.3, (60 / bpm) * 0.9);
  const ph = PHRASES[bar % PHRASES.length];
  const n = ph[i];
  if (track !== 'menu' || bar % 8 >= 2) {
    if (n >= 0) pluck(note(n), t, dur, i % 4 === 0 ? 0.16 : 0.11, 'square', musicBus);
  }
  // Drone string: tonic on the beat, the fourth on the off-beat ("dum-da").
  if (i % 4 === 0) pluck(ROOT / 2, t, dur * 1.4, 0.13, 'triangle', musicBus);
  if (i % 4 === 2) pluck((ROOT / 2) * 4 / 3, t, dur, 0.08, 'triangle', musicBus);
  if (track !== 'menu' && (i === 0 || i === 6 || i === 8 || i === 11)) thump(t, 0.5);
}

function tick() {
  if (!ac || track === 'none') return;
  while (nextTime < ac.currentTime + 0.12) {
    playStep(step, nextTime);
    nextTime += 60 / bpm / 4;
    step++;
  }
}

function startScheduler() {
  if (!ac) return;
  nextTime = ac.currentTime + 0.05;
  if (timer === undefined) timer = window.setInterval(tick, 25);
}

function player(name: Song): SongPlayer | null {
  if (!ac) return null;
  let p = players[name];
  if (!p) {
    const el = new Audio(import.meta.env.BASE_URL + SONGS[name]);
    el.loop = true;
    el.preload = 'auto';
    const gain = ac.createGain();
    gain.gain.value = 0;
    gain.connect(master);
    ac.createMediaElementSource(el).connect(gain);
    p = players[name] = { el, gain };
  }
  return p;
}

function startSong(name: Song, from?: number) {
  const p = player(name);
  if (!p || !ac) return;
  clearTimeout(p.pause);
  if (from !== undefined) p.el.currentTime = from;
  p.el.playbackRate = 1;
  p.gain.gain.setTargetAtTime(0.85, ac.currentTime, 0.08);
  p.el.play().catch(() => {});
}

function stopSongs(except?: Song) {
  if (!ac) return;
  for (const [name, p] of Object.entries(players) as [Song, SongPlayer][]) {
    if (name === except || p.el.paused) continue;
    p.gain.gain.setTargetAtTime(0, ac.currentTime, 0.1);
    clearTimeout(p.pause);
    p.pause = window.setTimeout(() => p.el.pause(), 500);
  }
}

/** `from` (seconds) seeks a song; without it a song keeps playing across screens. */
export function playMusic(t: Track, from?: number) {
  if (t === track && from === undefined) return;
  track = t;
  stopSongs(isSong(t) ? t : undefined);
  if (isSong(t)) {
    clearInterval(timer);
    timer = undefined;
    startSong(t, from);
    return;
  }
  step = 0;
  bpm = t === 'menu' ? 112 : 140;
  if (t === 'none') {
    clearInterval(timer);
    timer = undefined;
  } else startScheduler();
}

/** 0 = relaxed, 1 = hurry, 2 = panic. Speeds up the toi song (or the dombra chiptune). */
export function setIntensity(level: number) {
  if (track === 'toi') {
    const p = players.toi;
    const rate = [1, 1.1, 1.2][level] ?? 1;
    if (p && p.el.playbackRate !== rate) p.el.playbackRate = rate;
  } else if (track === 'game') bpm = [140, 176, 212][level] ?? 140;
}

const SFX: Record<string, [number, number, number, OscillatorType][]> = {
  // [freq, delay, dur, wave]
  click: [[880, 0, 0.05, 'square']],
  pick: [[660, 0, 0.06, 'square'], [990, 0.05, 0.06, 'square']],
  good: [[440, 0, 0.1, 'square'], [554, 0.07, 0.1, 'square'], [659, 0.14, 0.1, 'square'], [880, 0.21, 0.2, 'square']],
  bad: [[220, 0, 0.18, 'sawtooth'], [165, 0.12, 0.3, 'sawtooth']],
  leave: [[523, 0, 0.12, 'triangle'], [392, 0.12, 0.12, 'triangle'], [262, 0.24, 0.3, 'triangle']],
  coin: [[988, 0, 0.06, 'square'], [1319, 0.06, 0.18, 'square']],
  candy: [[740, 0, 0.06, 'triangle'], [1100, 0.04, 0.06, 'triangle']],
  star: [[880, 0, 0.1, 'square'], [1760, 0.08, 0.25, 'square']],
  alarm: [[880, 0, 0.12, 'square'], [660, 0.14, 0.12, 'square'], [880, 0.28, 0.12, 'square'], [660, 0.42, 0.12, 'square']],
  fanfare: [[523, 0, 0.12, 'square'], [659, 0.12, 0.12, 'square'], [784, 0.24, 0.12, 'square'], [1047, 0.36, 0.4, 'square']],
  fail: [[392, 0, 0.25, 'triangle'], [370, 0.25, 0.25, 'triangle'], [349, 0.5, 0.25, 'triangle'], [330, 0.75, 0.6, 'triangle']],
};

export function sfx(name: keyof typeof SFX | string) {
  if (!ac) return;
  const t = ac.currentTime;
  for (const [f, d, dur, w] of SFX[name] ?? []) pluck(f, t + d, dur, 0.14, w, sfxBus);
}
