// Chiptune dombra: a two-string pluck (melody + fourth-tuned drone) and a dauylpaz thump.
import { BETASHAR_BPM } from './sim/mini';

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

export type Track = 'menu' | 'game' | 'betashar' | Song | 'none';
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
  }
  if (ac.state === 'suspended') ac.resume();
  loadVoices();
  // Retry on every gesture: a play() attempted outside a gesture (or on a gesture iOS
  // doesn't count, like pointerdown) is rejected and would otherwise stay silent.
  if (isSong(track)) {
    const p = players[track];
    if (!p || p.el.paused) startSong(track);
  } else if (track !== 'none' && timer === undefined) startScheduler();
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
  if (track === 'betashar') {
    // Steady quarter-note drum so the bows can be timed by ear.
    if (i % 4 === 0) thump(t, i === 0 ? 0.7 : 0.45);
  } else if (track !== 'menu' && (i === 0 || i === 6 || i === 8 || i === 11)) thump(t, 0.5);
}

function tick() {
  if (!ac || track === 'none') return;
  while (nextTime < ac.currentTime + 0.12) {
    playStep(step, nextTime);
    nextTime += 60 / bpm / 4;
    step++;
  }
}

let trackStart = 0;

function startScheduler() {
  if (!ac) return;
  nextTime = ac.currentTime + 0.05;
  trackStart = nextTime;
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
  bpm = t === 'menu' ? 112 : t === 'betashar' ? BETASHAR_BPM : 140;
  if (t === 'none') {
    clearInterval(timer);
    timer = undefined;
  } else startScheduler();
}

export { BETASHAR_BPM } from './sim/mini';

/** Audio-clock time (s) and when the current chiptune's step 0 played; null before the first tap. */
export function musicClock(): { now: number; start: number } | null {
  return ac && timer !== undefined ? { now: ac.currentTime, start: trackStart } : null;
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
  tick: [[1250, 0, 0.03, 'square']],
  combo: [[660, 0, 0.06, 'square'], [880, 0.05, 0.06, 'square'], [1320, 0.1, 0.14, 'square']],
  tea: [[1400, 0, 0.04, 'triangle'], [1180, 0.04, 0.04, 'triangle'], [1500, 0.08, 0.04, 'triangle'], [1250, 0.12, 0.05, 'triangle'], [1600, 0.17, 0.08, 'triangle']],
  advice: [[523, 0, 0.08, 'triangle'], [659, 0.08, 0.08, 'triangle'], [784, 0.16, 0.18, 'triangle']],
  dombra: [[294, 0, 0.14, 'triangle'], [440, 0.12, 0.12, 'triangle'], [392, 0.24, 0.12, 'triangle'], [440, 0.36, 0.12, 'triangle'],
    [294, 0.48, 0.12, 'triangle'], [330, 0.6, 0.12, 'triangle'], [294, 0.72, 0.3, 'triangle']],
  fail: [[392, 0, 0.25, 'triangle'], [370, 0.25, 0.25, 'triangle'], [349, 0.5, 0.25, 'triangle'], [330, 0.75, 0.6, 'triangle']],
};

/** A synthesized "Oi-bai!": a sawtooth voice through two formant filters gliding o→i, b, a→i. */
function oibai() {
  if (!ac) return;
  const t = ac.currentTime;
  const src = ac.createOscillator();
  src.type = 'sawtooth';
  // An azhe's exclamation: up on "oi", falling on "bai".
  src.frequency.setValueAtTime(330, t);
  src.frequency.linearRampToValueAtTime(400, t + 0.12);
  src.frequency.setValueAtTime(370, t + 0.26);
  src.frequency.exponentialRampToValueAtTime(230, t + 0.62);
  const vib = ac.createOscillator();
  const vibG = ac.createGain();
  vib.frequency.value = 6;
  vibG.gain.value = 6;
  vib.connect(vibG).connect(src.frequency);
  const out = ac.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
  out.gain.setValueAtTime(0.5, t + 0.18);
  out.gain.exponentialRampToValueAtTime(0.05, t + 0.22); // the "b" closure
  out.gain.exponentialRampToValueAtTime(0.55, t + 0.27);
  out.gain.setValueAtTime(0.5, t + 0.5);
  out.gain.exponentialRampToValueAtTime(0.0001, t + 0.66);
  // [time, F1, F2]: o → i, then a → i.
  const path: [number, number, number][] = [[0, 450, 850], [0.1, 450, 850], [0.2, 300, 2200], [0.27, 780, 1250], [0.42, 780, 1250], [0.62, 320, 2100]];
  for (const [k, gain] of [[1, 1], [2, 0.6]] as const) {
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 7;
    f.frequency.setValueAtTime(path[0][k], t);
    for (const [dt, f1, f2] of path.slice(1)) f.frequency.linearRampToValueAtTime(k === 1 ? f1 : f2, t + dt);
    const g = ac.createGain();
    g.gain.value = gain * 2.2;
    src.connect(f).connect(g).connect(out);
  }
  out.connect(sfxBus);
  src.start(t);
  vib.start(t);
  src.stop(t + 0.7);
  vib.stop(t + 0.7);
}

/** Metallic coin: inharmonic sine partials with fast decays plus a tick. */
function clink() {
  if (!ac) return;
  const t = ac.currentTime;
  for (const [f, d, v] of [[2093, 0.35, 0.12], [3230, 0.22, 0.08], [4290, 0.18, 0.06], [5580, 0.12, 0.04]]) {
    const o = ac.createOscillator();
    o.frequency.value = f;
    const g = ac.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(sfxBus);
    o.start(t);
    o.stop(t + d + 0.02);
  }
  const n = ac.createBufferSource();
  n.buffer = noise;
  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 6000;
  const ng = ac.createGain();
  ng.gain.setValueAtTime(0.15, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
  n.connect(hp).connect(ng).connect(sfxBus);
  n.start(t);
  n.stop(t + 0.03);
}

/** A crowd clapping: many short band-passed noise bursts, swelling then thinning out. */
export function applause(seconds = 2.5) {
  if (!ac) return;
  const t0 = ac.currentTime;
  const claps = Math.round(seconds * 45);
  for (let i = 0; i < claps; i++) {
    const p = Math.random();
    const at = t0 + Math.pow(p, 1.4) * seconds;
    const n = ac.createBufferSource();
    n.buffer = noise;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900 + Math.random() * 1800;
    f.Q.value = 1.2;
    const g = ac.createGain();
    const v = (0.12 + Math.random() * 0.12) * (1 - p * 0.7);
    g.gain.setValueAtTime(v, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.03 + Math.random() * 0.03);
    n.connect(f).connect(g).connect(sfxBus);
    n.start(at, Math.random() * 0.2);
    n.stop(at + 0.07);
  }
}

// Voice clips (Kazakh TTS in public/voice), decoded after the first tap.
// Only the azhe's "Oibai!" on mistakes is voiced.
const VOICES: Record<string, string[]> = { oibai: ['oibai1', 'oibai2'] };
const clips = new Map<string, AudioBuffer>();
let voiceBusy = 0;
let voicesLoading = false;

function loadVoices() {
  if (!ac || voicesLoading) return;
  voicesLoading = true;
  const ctx = ac;
  for (const file of Object.values(VOICES).flat()) {
    fetch(`${import.meta.env.BASE_URL}voice/${file}.mp3`)
      .then((r) => r.arrayBuffer())
      .then((b) => ctx.decodeAudioData(b))
      .then((buf) => clips.set(file, buf))
      .catch(() => {});
  }
}

/** Speak a line. Lines never overlap: a new one is dropped while another is still playing (unless forced). */
export function voice(name: string, force = false): boolean {
  if (!ac) return false;
  const now = ac.currentTime;
  if (!force && now < voiceBusy) return false;
  const files = (VOICES[name] ?? []).filter((f) => clips.has(f));
  if (!files.length) return false;
  const buf = clips.get(files[Math.floor(Math.random() * files.length)])!;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const g = ac.createGain();
  g.gain.value = 1.1;
  src.connect(g).connect(sfxBus);
  src.start(now);
  voiceBusy = now + buf.duration;
  return true;
}

export function sfx(name: keyof typeof SFX | string) {
  if (!ac) return;
  if (name === 'oibai') return void (voice('oibai') || oibai());
  if (name === 'coin') return clink();
  if (name === 'applause') return applause();
  const t = ac.currentTime;
  for (const [f, d, dur, w] of SFX[name] ?? []) pluck(f, t + d, dur, 0.14, w, sfxBus);
}
