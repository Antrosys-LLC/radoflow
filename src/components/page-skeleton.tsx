import { Card } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

/**
 * What a screen shows while its data is on the way.
 *
 * Every route in this group is `force-dynamic`, so Next has nothing prerendered
 * to swap in when a nav link is clicked. Without a `loading.tsx` the browser
 * simply sits on the previous screen — frozen, no spinner, nothing — until the
 * whole server render finishes. On a factory connection to a Supabase project
 * several round trips away that is seconds of a UI that looks broken, and the
 * usual reaction is to click the link again, which starts a second render.
 *
 * A skeleton turns that into an immediate response: the shell and the menu are
 * already on screen, the new page's shape appears at once, and the content
 * streams into it. The work takes the same time; the app stops feeling stuck.
 *
 * Shapes rather than a spinner, so the layout does not jump when the real
 * content lands.
 */

function Bar({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-muted-foreground/10", className)} />;
}

/** A heading and a run of rows — the shape most screens here settle into. */
export function PageSkeleton({
  rows = 6,
  stats = 0,
}: {
  rows?: number;
  /** Screens that open on a row of metric pills. */
  stats?: number;
}) {
  return (
    <div className="space-y-5 pb-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      {stats > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: stats }).map((_, i) => (
            <Card key={i} className="p-5">
              <Bar className="h-3 w-24" />
              <Bar className="mt-3 h-7 w-20" />
            </Card>
          ))}
        </div>
      ) : null}

      <Card className="p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <Bar className="size-11 shrink-0 rounded-2xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Bar className="h-4 w-48 max-w-full" />
            <Bar className="h-3 w-72 max-w-full" />
          </div>
        </div>

        <div className="mt-6 space-y-2.5">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-2xl border border-border p-3.5">
              <Bar className="size-9 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Bar className="h-3.5 w-1/3" />
                <Bar className="h-3 w-1/4" />
              </div>
              <Bar className="hidden h-3 w-20 sm:block" />
              <Bar className="h-7 w-16 shrink-0 rounded-xl" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
