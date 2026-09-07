import { describe, expect, it } from "vitest";

import en from "./en";
import roman from "./roman-ur";
import ur from "./ur";
import { dictionaryFor, directionFor, isolate, LANGUAGE_LABELS, resolveLanguage } from "./index";

/** Every leaf path in a nested dictionary, e.g. "nav.dashboard". */
function paths(value: unknown, prefix = ""): string[] {
  if (typeof value === "string") return [prefix];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) =>
    paths(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("resolveLanguage", () => {
  it("accepts each of the three codes", () => {
    expect(resolveLanguage("en")).toBe("en");
    expect(resolveLanguage("ur")).toBe("ur");
    expect(resolveLanguage("roman-ur")).toBe("roman-ur");
  });

  /*
   * The value reaches this from two untrusted places: a profiles row written
   * before the column was constrained, and the browser at the toggle.
   */
  it.each([["urdu"], ["UR"], ["en-GB"], [""], [null], [undefined], [7], [{}]])(
    "falls back to English for %s",
    (value) => {
      expect(resolveLanguage(value)).toBe("en");
    },
  );
});

describe("directionFor", () => {
  it("is right-to-left for Urdu script only", () => {
    expect(directionFor("ur")).toBe("rtl");
  });

  it("keeps Roman Urdu left-to-right", () => {
    // Urdu written in Latin letters. Flipping it would be wrong, and this is
    // the case most likely to be got wrong by someone pattern-matching on
    // "Urdu".
    expect(directionFor("roman-ur")).toBe("ltr");
  });

  it("keeps English left-to-right", () => {
    expect(directionFor("en")).toBe("ltr");
  });
});

describe("isolate", () => {
  const LRI = "⁦";
  const PDI = "⁩";

  it("wraps the value in LEFT-TO-RIGHT ISOLATE and POP DIRECTIONAL ISOLATE", () => {
    expect(isolate("RD-1042")).toBe(`${LRI}RD-1042${PDI}`);
  });

  it("is safe on an empty string", () => {
    // Still two control characters and nothing else — not a no-op, since an
    // empty run has no value to protect, but it must not throw or drop a mark.
    expect(isolate("")).toBe(`${LRI}${PDI}`);
  });

  it("does not corrupt a value that is isolated twice", () => {
    // A value isolated a second time — through a helper composed with itself,
    // say — must stay recoverable: nesting adds marks, it does not mangle the
    // text between them.
    const once = isolate("RD-1042");
    const twice = isolate(once);
    expect(twice).toBe(`${LRI}${LRI}RD-1042${PDI}${PDI}`);
  });

  it("does not corrupt a value that already contains isolate marks", () => {
    // The value itself might carry marks — e.g. from being built out of two
    // already-isolated pieces — and isolate() must not strip or collapse them.
    const nested = `${LRI}inner${PDI}`;
    expect(isolate(nested)).toBe(`${LRI}${LRI}inner${PDI}${PDI}`);
  });
});

describe("dictionaryFor", () => {
  it("returns the matching dictionary", () => {
    expect(dictionaryFor("en")).toBe(en);
    expect(dictionaryFor("ur")).toBe(ur);
    expect(dictionaryFor("roman-ur")).toBe(roman);
  });
});

describe("the dictionaries agree", () => {
  const expected = paths(en).sort();

  it.each([
    ["ur", ur],
    ["roman-ur", roman],
  ])("%s has exactly the keys English has", (_name, dictionary) => {
    // TypeScript already catches a *missing* key through the Dictionary
    // annotation. This catches the reverse — a stale key left behind after a
    // rename — and names the offending path instead of failing structurally.
    expect(paths(dictionary).sort()).toEqual(expected);
  });

  it.each([
    ["en", en],
    ["ur", ur],
    ["roman-ur", roman],
  ])("%s has no empty strings", (_name, dictionary) => {
    // An empty string satisfies the type and renders as a blank label. It is
    // the one failure the type system cannot see.
    const blanks = paths(dictionary).filter((path) => {
      const value = path
        .split(".")
        .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], dictionary);
      return typeof value === "string" && value.trim() === "";
    });
    expect(blanks).toEqual([]);
  });

  it("labels every language in its own script", () => {
    expect(LANGUAGE_LABELS.en).toBe("English");
    expect(LANGUAGE_LABELS.ur).toBe("اردو");
    expect(LANGUAGE_LABELS["roman-ur"]).toBe("Roman Urdu");
  });

  // The Unicode Script property, not a hand-rolled set of code point ranges —
  // Urdu script spills across the main Arabic block, Arabic Supplement,
  // Arabic Extended-A/B/C and Arabic Presentation Forms-A *and* -B as
  // ligatures and extended letters are added, and a range list drifts stale
  // the moment one of those blocks is missed. `ﻻ` (U+FEFB, ARABIC LIGATURE
  // LAM WITH ALEF ISOLATED FORM) lives in Presentation Forms-B and would slip
  // past a guard that only reaches Forms-A.
  const ARABIC_SCRIPT = /\p{Script=Arabic}/u;

  it("ur is written in Arabic script and roman-ur never is", () => {
    // The two Urdu dictionaries are easy to paste into the wrong file — same
    // language, same meaning, only the script differs. `{tokens}` are
    // stripped first: a placeholder like "{total}" is Latin by construction
    // and says nothing about the surrounding sentence's script. A value that
    // is nothing but a stripped token or punctuation carries no script of its
    // own, so it is skipped rather than failed either way.
    //
    // This half would fail an all-Latin `ur` value outright — a hardware
    // model name, say, with no Urdu translation. That is deliberate, not an
    // oversight: `ur` is Urdu script by definition here, so a value with no
    // Arabic-script character in it is either mistranslated or belongs in a
    // dictionary this test does not police (e.g. left untranslated on
    // purpose). A future value like that needs its path excluded above, not
    // this assertion loosened.
    for (const path of paths(en)) {
      const urValue = path
        .split(".")
        .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], ur) as string;
      const romanValue = path
        .split(".")
        .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], roman) as string;

      const urStripped = urValue.replace(/\{[^}]*\}/g, "");
      if (/\p{L}/u.test(urStripped)) {
        expect(ARABIC_SCRIPT.test(urStripped), `ur.${path} has no Arabic script: ${urValue}`).toBe(
          true,
        );
      }

      const romanStripped = romanValue.replace(/\{[^}]*\}/g, "");
      expect(
        ARABIC_SCRIPT.test(romanStripped),
        `roman-ur.${path} contains Arabic script: ${romanValue}`,
      ).toBe(false);
    }
  });

  /*
   * The Ask effort dial. Five buttons at ~56px each on a 360px phone, where
   * three of the five full English labels measured 64-66px and overflowed —
   * `short` is the fix, and this is the constraint that layout depends on.
   * Without it the next added level, or the next translation, silently brings
   * the overflow back.
   *
   * The Latin dictionaries are held to the four characters that were actually
   * measured. Urdu is allowed six: its letters join, so a six-letter word sets
   * narrower than six Latin capitals, and four would leave no word that means
   * "maximum".
   */
  it.each([
    ["en", en, 4],
    ["roman-ur", roman, 4],
    ["ur", ur, 6],
  ])(
    "gives every effort level in %s a short form that fits the compact dial",
    (_name, dictionary, limit) => {
      const levels = Object.values((dictionary as typeof en).ask.effort);
      expect(levels).toHaveLength(5);
      for (const level of levels) {
        expect(level.short.length, `"${level.short}" is longer than ${limit}`).toBeLessThanOrEqual(
          limit as number,
        );
      }
    },
  );

  it("every translation keeps the same {placeholders} as English", () => {
    // A translator can drop a token while reordering a sentence around it —
    // Urdu puts the words in a different order, so the token that carried
    // "{count}" is easy to lose in the shuffle. The renderer does not
    // complain when that happens; the number is simply missing from the
    // sentence. Order is allowed to differ; only the set of names matters.
    const tokensIn = (value: string) =>
      new Set([...value.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]));

    for (const path of paths(en)) {
      const get = (dictionary: unknown) =>
        path
          .split(".")
          .reduce<unknown>(
            (node, key) => (node as Record<string, unknown>)[key],
            dictionary,
          ) as string;

      const expectedTokens = tokensIn(get(en));

      for (const [name, dictionary] of [
        ["ur", ur],
        ["roman-ur", roman],
      ] as const) {
        expect(
          [...tokensIn(get(dictionary))].sort(),
          `${name}.${path} has different placeholders`,
        ).toEqual([...expectedTokens].sort());
      }
    }
  });
});
