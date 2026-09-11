/**
 * What a loading screen says while it waits.
 *
 * A skeleton with no words is honest but silent, and on a slow connection in a
 * factory office silence reads as "stuck". A rotating word says the machine is
 * still thinking without pretending to know how long it will take — which a
 * progress bar would, and would be lying about, because none of these screens
 * can predict their own query.
 *
 * English on purpose, and this is the one place in the app where that is a
 * deliberate choice rather than an omission. These are jokes as much as words,
 * and a joke translated by somebody who was not in the room stops being one —
 * "Flibbertigibbeting" has no Urdu, and inventing something to stand in its
 * place would be worse than leaving it. The screens around them are fully
 * translated; this is a wink, not information.
 */

/** Thinking about it. */
const THINKING = [
  "Pondering",
  "Contemplating",
  "Cogitating",
  "Deliberating",
  "Ruminating",
  "Musing",
  "Philosophising",
  "Cerebrating",
  "Inferring",
  "Deciphering",
  "Considering",
  "Elucidating",
  "Mulling",
  "Reasoning",
  "Weighing",
  "Noodling",
] as const;

/** Left on the stove. */
const COOKING = [
  "Brewing",
  "Baking",
  "Simmering",
  "Stewing",
  "Percolating",
  "Marinating",
  "Churning",
  "Concocting",
  "Cooking",
] as const;

/** Making the thing. */
const MAKING = [
  "Crafting",
  "Creating",
  "Forging",
  "Generating",
  "Synthesizing",
  "Manifesting",
  "Coalescing",
  "Conjuring",
  "Composing",
  "Computing",
  "Calculating",
  "Processing",
  "Reticulating",
  "Spinning",
  "Whirring",
  "Channeling",
  "Germinating",
  "Incubating",
  "Hatching",
  "Unfurling",
  "Unravelling",
] as const;

/** Not even pretending. */
const SILLY = [
  "Booping",
  "Flibbertigibbeting",
  "Wibbling",
  "Vibing",
  "Frolicking",
  "Honking",
  "Clauding",
  "Discombobulating",
] as const;

export const LOADING_WORDS: readonly string[] = [...THINKING, ...COOKING, ...MAKING, ...SILLY];

/**
 * One word, picked from `seed`.
 *
 * Takes the seed rather than calling `Math.random()` so a server render and the
 * hydration that follows it agree — a word that changes between the two is a
 * hydration mismatch, and React replaces the whole subtree to fix it, which on
 * a loading skeleton is a visible flicker at the worst possible moment.
 */
export function loadingWord(seed: number): string {
  const index = Math.abs(Math.floor(seed)) % LOADING_WORDS.length;
  return LOADING_WORDS[index] ?? "Loading";
}
