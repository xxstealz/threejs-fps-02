// One seeded RNG for the whole simulation, so a ?shot= capture replays exactly and
// the bots' decisions are reproducible. Gameplay and visuals never call
// Math.random(); only the audio noise buffer does, and it never affects the
// simulation or the picture.
export function mulberry32(initial) {
  let a = initial | 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(random, array) {
  return array[Math.floor(random() * array.length)];
}

export function range(random, min, max) {
  return min + random() * (max - min);
}

// Gaussian-ish error in [-1, 1] for aim: average of two uniforms, cheap and centred.
export function aimError(random) {
  return (random() + random() - 1) * 0.8;
}
