import { t } from './i18n';
import { WAVES, dailyChallenge } from './waves';
import { profile } from './storage';

/** Halls the player's reputation has unlocked, in order. */
export const unlockedHalls = (rep = profile.rep) => WAVES.filter((w) => rep >= w.rep).map((w) => w.idx);

// State of the current toi: a campaign through every unlocked hall, or today's daily toi.
export const run = {
  mode: 'campaign' as 'campaign' | 'daily',
  halls: [0] as number[], // WAVES indices played in this toi
  wave: 0, // position in `halls`
  scores: [] as number[],
  stars: [] as number[],
  candies: 0,
  coins: 0,
  seed: 1,
  dailyKey: '',
  reset(mode: 'campaign' | 'daily' = 'campaign') {
    this.mode = mode;
    this.wave = 0;
    this.candies = 0;
    this.coins = 0;
    if (mode === 'daily') {
      const d = dailyChallenge();
      this.halls = [d.hall];
      this.seed = d.seed;
      this.dailyKey = d.key;
    } else {
      this.halls = unlockedHalls();
      this.seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    }
    this.scores = this.halls.map(() => 0);
    this.stars = this.halls.map(() => 0);
  },
  hall() {
    return WAVES[this.halls[this.wave]];
  },
  isLast() {
    return this.wave >= this.halls.length - 1;
  },
  total() {
    return this.scores.reduce((a, b) => a + b, 0) + this.candies * 2;
  },
};

export const title = (stars: number) => t('title' + stars);

/** Pixels the dragged sprite floats above the pointer (so a finger doesn't hide it). */
export const input = { liftY: 16 };
