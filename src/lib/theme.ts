/**
 * Light, dark, or whatever the phone is set to.
 *
 * Kept in a cookie rather than in local storage, and that is the whole design.
 * Local storage cannot be read on the server, so the first paint is always the
 * wrong theme and then corrects itself — a white flash on a dark phone, on
 * every navigation, which on a factory floor at night is the difference
 * between a usable screen and one nobody opens twice.
 *
 * With a cookie the server already knows, and the page arrives painted.
 *
 * The one case a cookie cannot answer is "system": what the device prefers is
 * known only to the device. That is resolved by a tiny script in the document
 * head, before the browser paints — see `THEME_SCRIPT`.
 */

export const THEME_COOKIE = "radoflow-theme";
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** What the person chose. `system` follows the device. */
export type ThemeChoice = "light" | "dark" | "system";

/** What is actually painted. `system` has already been resolved to one of these. */
export type ResolvedTheme = "light" | "dark";

export function resolveThemeChoice(value: unknown): ThemeChoice {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

/**
 * The class and attribute the document carries.
 *
 * Both, deliberately, because two things read the theme and they were written
 * against different conventions: Tailwind's `dark:` variant is compiled
 * against `.dark`, and the chart tokens in `components/charts.tsx` key off
 * `[data-theme="dark"]`. Stamping one and not the other gives a page with dark
 * chrome and light charts, which is worse than either.
 */
export function themeAttributes(theme: ResolvedTheme): {
  className: string;
  "data-theme": ResolvedTheme;
} {
  return { className: theme === "dark" ? "dark" : "", "data-theme": theme };
}

/**
 * Run in the document head, before first paint, to resolve `system`.
 *
 * Deliberately tiny and deliberately synchronous: anything that runs after
 * paint produces the flash this whole file exists to prevent. It only ever
 * *adds* the resolved theme when the server could not — when the cookie said
 * light or dark, the server already stamped it and this leaves it alone.
 *
 * Wrapped in try/catch because `matchMedia` is absent in some embedded
 * webviews, and a theme is not worth a blank page.
 */
export const THEME_SCRIPT = `
(function () {
  try {
    var root = document.documentElement;
    if (root.getAttribute('data-theme')) return;
    var dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    if (dark) root.classList.add('dark');
  } catch (e) {}
})();
`.trim();

/**
 * Paints a choice onto the document and remembers it, in the browser.
 *
 * Both halves belong together and both belong here rather than in the switch
 * component. The paint is immediate, because the whole screen is the feedback
 * and a theme that waits for a server round trip feels broken; the cookie is
 * only so the *next* request arrives already painted.
 */
export function applyTheme(choice: ThemeChoice): void {
  if (typeof document === "undefined") return;

  const dark =
    choice === "dark" ||
    (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  const root = document.documentElement;
  root.setAttribute("data-theme", dark ? "dark" : "light");
  root.classList.toggle("dark", dark);

  document.cookie = `${THEME_COOKIE}=${choice}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
}
