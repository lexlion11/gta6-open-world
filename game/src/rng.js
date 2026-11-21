// Deterministic seeded RNG (mulberry32) plus small helpers, so the city, its traffic
// and the screenshot scenes replay identically for a given seed.

/** mulberry32: fast, well-distributed, returns a function producing [0,1). */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a hash of a string, for turning names into seeds. */
export function hashString(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A rng call in [min, max). */
export function between(rng, min, max) {
  return min + rng() * (max - min);
}

/** A rng integer in [min, max] inclusive. */
export function pickInt(rng, min, max) {
  return Math.floor(min + rng() * (max - min + 1));
}

/** A random element of an array. */
export function pickFrom(rng, array) {
  return array[Math.floor(rng() * array.length)];
}

/** True with probability p. */
export function chance(rng, p) {
  return rng() < p;
}
