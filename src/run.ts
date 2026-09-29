// State of the current toi (three waves + shashu rounds).
export const run = {
  wave: 0, // index into WAVES
  scores: [0, 0, 0],
  stars: [0, 0, 0],
  candies: 0,
  coins: 0,
  seed: 1,
  reset() {
    this.wave = 0;
    this.scores = [0, 0, 0];
    this.stars = [0, 0, 0];
    this.candies = 0;
    this.coins = 0;
    this.seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
  },
  total() {
    return this.scores.reduce((a, b) => a + b, 0) + this.candies * 2;
  },
};

export const TITLES = ['TOI BUZYLDY!', 'ZHAMAN TOISHY', 'ZHAKSY TOISHY', 'ULY TOISHY'];

/** Pixels the dragged sprite floats above the pointer (so a finger doesn't hide it). */
export const input = { liftY: 16 };
