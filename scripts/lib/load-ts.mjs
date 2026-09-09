/**
 * Lets a plain `node scripts/*.mjs` import the app's own TypeScript.
 *
 * The alternative was to reimplement in a script whatever the app already
 * does — and for something like the payroll engine, a second implementation
 * that drifts by a rupee is worse than no script at all. So the scripts import
 * the real module and Node runs it.
 *
 * Node 24 strips the types itself. What it will not do is resolve the two
 * conveniences TypeScript allows and Node's ESM resolver does not:
 *
 *  - `@/lib/...`, the tsconfig path alias for `src/`.
 *  - `./engine`, an import with no file extension.
 *
 * Both are handled below, and nothing else is: a bare `react` or `node:fs`
 * falls straight through to Node's own resolver, so this cannot quietly shadow
 * a real package.
 *
 * Deliberately no bundler and no loader dependency. A dev tool that stops
 * working because a transitive package moved is a dev tool nobody trusts.
 */

import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** The repository's `src`, from this file rather than from the CWD. */
const SRC = path.resolve(fileURLToPath(new URL("../../src", import.meta.url)));

/** The first of `x`, `x.ts`, `x.tsx`, `x/index.ts` that is a real file. */
function firstFile(base) {
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

let installed = false;

/** Installs the resolver. Safe to call more than once. */
export function enableAppImports() {
  if (installed) return;
  installed = true;

  registerHooks({
    resolve(specifier, context, next) {
      let target = null;

      if (specifier.startsWith("@/")) {
        target = path.join(SRC, specifier.slice(2));
      } else if (specifier.startsWith("./") || specifier.startsWith("../")) {
        const parent =
          context.parentURL && context.parentURL.startsWith("file:")
            ? path.dirname(fileURLToPath(context.parentURL))
            : process.cwd();
        target = path.resolve(parent, specifier);
      }

      const file = target && firstFile(target);
      // Only short-circuit on a file that exists. Anything else — a package, a
      // built-in, a relative path Node can already resolve — is Node's.
      return file
        ? { url: pathToFileURL(file).href, shortCircuit: true }
        : next(specifier, context);
    },
  });
}
