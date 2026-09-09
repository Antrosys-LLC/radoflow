/**
 * Telling "the database is behind the code" apart from everything else.
 *
 * This app ships migrations in the repository and applies them by hand, so
 * there is a real window — sometimes days — where the deployed code reads a
 * column the live database has not got yet. When that happens the read fails,
 * the page throws, and the reader is shown "Something went wrong at our end",
 * which is true and completely useless: the fix is one SQL file, and nothing
 * on the screen says so.
 *
 * Postgres and PostgREST both name this case precisely, and nothing else
 * produces those codes:
 *
 *  - `42703` — undefined_column, raised by Postgres itself.
 *  - `42P01` — undefined_table.
 *  - `PGRST204` / `PGRST205` — PostgREST could not find a column or a table in
 *    its cached schema, which is the same problem seen one layer up.
 *
 * Matching on the codes rather than on the message text, because the text is
 * English prose from the server and changes between versions.
 */

const SCHEMA_CODES = new Set(["42703", "42P01", "PGRST204", "PGRST205"]);

/** True when this failure means a migration has not been applied. */
export function isSchemaOutOfDate(error: unknown): boolean {
  if (!error) return false;

  if (typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && SCHEMA_CODES.has(code)) return true;
  }

  /*
   * `selectInBatches` throws an `Error` whose message is the PostgREST one,
   * and by then the code is gone. The two phrasings below are what Postgres
   * and PostgREST actually say, and both are specific enough that no ordinary
   * failure produces them.
   */
  const message = error instanceof Error ? error.message : String(error);
  return (
    /column .+ does not exist/i.test(message) ||
    /relation .+ does not exist/i.test(message) ||
    /Could not find the .+ column/i.test(message) ||
    /schema cache/i.test(message)
  );
}
