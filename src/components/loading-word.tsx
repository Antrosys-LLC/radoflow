"use client";

import { useSyncExternalStore } from "react";

import { loadingWord } from "@/lib/loading-words";
import { createTickStore } from "@/lib/tick";

/**
 * The word above a loading skeleton, changing while you wait.
 *
 * It moves on a timer rather than being picked once, and that is the whole
 * point of it: a static word is indistinguishable from a frozen page, which is
 * exactly the impression a slow screen gives and exactly what this is for. A
 * word that changes every few seconds says the machine is still going without
 * claiming to know how long it will take — which a progress bar would, and
 * would be lying about, since none of these screens can predict their query.
 *
 * `useSyncExternalStore` rather than state written from an effect: the server
 * has no clock the browser agrees with, so the first paint has to be a fixed
 * word and the rotation can only start after hydration. This is the shape
 * React provides for exactly that, and it keeps the timer out of render.
 */

/** How long a word stays up. Coarse enough that a fast render does not flicker. */
const WORD_MS = 2200;

const words = createTickStore(WORD_MS);

export function LoadingWord() {
  // The server snapshot is a constant, so the markup it renders and the
  // browser's first paint agree; the timer takes over from there.
  const at = useSyncExternalStore(words.subscribe, words.getSnapshot, words.getServerSnapshot);
  const step = Math.floor(at / WORD_MS);

  return (
    <p aria-hidden className="text-sm font-semibold text-muted-foreground">
      {loadingWord(step)}
      <span className="animate-pulse">…</span>
    </p>
  );
}
