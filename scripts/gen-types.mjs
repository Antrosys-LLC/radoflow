#!/usr/bin/env node
/**
 * Regenerates src/lib/supabase/database.types.ts.
 *
 * Replaces a shell one-liner that piped the CLI straight into the file with
 * `>`. The redirect truncates the target *before* the command runs, so any
 * failure — the CLI not being on PATH, Docker not running, an expired login —
 * left an empty types file and a project that no longer compiled. The output
 * is buffered here and only written once it looks like a real schema.
 *
 * Defaults to the linked cloud project, which needs no Docker. Pass --local to
 * read the Supabase stack running under `npm run db:start` instead.
 *
 * Usage:
 *   npm run db:types          # linked project
 *   npm run db:types:local    # local Docker stack
 */

import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const TARGET = "src/lib/supabase/database.types.ts";

/** Below this, the CLI printed an error or an empty schema rather than types. */
const PLAUSIBLE_BYTES = 2000;

const local = process.argv.includes("--local");
const source = local ? "--local" : "--linked";

console.log(`Generating types from the ${local ? "local stack" : "linked project"}…`);

let output;
try {
  /*
   * npx rather than a bare `supabase`: the CLI is a dev dependency here and is
   * not necessarily installed globally.
   *
   * Run through a shell, because on Windows npx is a .cmd and Node refuses to
   * spawn batch files directly since the 20.x command-injection fix, failing
   * with a bare EINVAL that says nothing about the cause. The command is built
   * entirely from constants, so there is nothing here to inject.
   */
  output = execSync(`npx supabase gen types typescript ${source}`, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"],
  });
} catch {
  console.error(`\n✗ The Supabase CLI failed. ${TARGET} is unchanged.`);
  console.error(
    local
      ? "  For --local, the Docker stack must be running: npm run db:start"
      : "  Check that the project is linked: npx supabase link",
  );
  // The CLI has already printed its own diagnostics to stderr; a Node stack
  // trace on top of them buries the line that actually explains the failure.
  process.exit(1);
}

if (!output || output.length < PLAUSIBLE_BYTES || !output.includes("export type Database")) {
  console.error(
    `\n✗ The CLI returned ${output?.length ?? 0} bytes with no Database type.\n` +
      `  ${TARGET} is unchanged rather than overwritten with a broken file.`,
  );
  process.exitCode = 1;
} else {
  writeFileSync(TARGET, output);
  console.log(`✓ Wrote ${output.length.toLocaleString()} bytes to ${TARGET}`);
}
