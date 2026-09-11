import { DatabaseZap } from "lucide-react";

import { Latin } from "@/components/latin";
import { Card } from "@/components/ui-kit";
import type { Dictionary } from "@/lib/i18n";

/**
 * What a screen shows when the database is behind the code.
 *
 * Not an error, and deliberately not styled as one. Nothing is broken and
 * nobody did anything wrong: a migration in the repository has not been run
 * yet, and until it is, this screen reads a column that does not exist. The
 * generic "Something went wrong at our end" is true and useless — the fix is
 * one SQL file, and a message that does not say so sends somebody hunting.
 *
 * The server's own words go underneath, in Latin and untranslated. They are
 * for whoever runs the file, they name the exact column, and paraphrasing them
 * into Urdu would remove the one thing that makes them actionable.
 */
export function SchemaOutOfDate({ t, detail }: { t: Dictionary; detail?: string | undefined }) {
  return (
    <Card className="p-6 text-center sm:p-8">
      <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-warning-soft text-warning">
        <DatabaseZap className="size-6" aria-hidden />
      </span>

      <h2 className="mt-4 text-base font-bold text-foreground">{t.errors.schemaTitle}</h2>
      <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">{t.errors.schemaBody}</p>

      {detail ? (
        <p className="mx-auto mt-3 max-w-lg break-words rounded-2xl bg-secondary px-4 py-3 font-latin text-[11px] text-muted-foreground">
          <Latin>{detail}</Latin>
        </p>
      ) : null}
    </Card>
  );
}
