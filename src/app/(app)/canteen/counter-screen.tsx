"use client";

import { useEffect, useState } from "react";
import { Ban, Check, Clock, HelpCircle, UtensilsCrossed } from "lucide-react";

import { AutoRefresh } from "@/components/auto-refresh";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * What the counter staff see.
 *
 * The people reading this screen do not read English, and several do not read
 * confidently in any language. So nothing important is carried by a sentence:
 *
 *  - Colour fills the whole panel. Green means hand over a plate, red means
 *    do not. That is legible from the far side of the counter and in the
 *    corner of an eye, which is how it will actually be read with a queue
 *    waiting.
 *  - One large symbol repeats the same thing for anyone who cannot rely on
 *    colour — roughly one man in twelve here will be red-green colourblind.
 *  - The worker's own photograph identifies them, since a name in Latin
 *    script often will not.
 *  - A time is shown for someone already served: digits are the one thing
 *    everyone at this counter can read, and "you ate at 13:05" ends the
 *    argument without a sentence.
 *
 * Urdu is given first in the short labels, English underneath, because the
 * counter is staffed by Urdu speakers even though the rest of the app is not.
 */

export interface ScanView {
  id: string;
  outcome: "served" | "duplicate" | "unknown_person" | "outside_window";
  fullName: string | null;
  employeeCode: string | null;
  photoUrl: string | null;
  mealName: string | null;
  scannedAt: string;
  /** When they were already served, for a refused second scan. */
  earlierAt: string | null;
}

const OUTCOME = {
  served: {
    icon: Check,
    urdu: "کھانا دے دیں",
    english: "Give food",
    panel: "bg-success text-white",
    badge: "bg-white/20",
  },
  duplicate: {
    icon: Ban,
    urdu: "پہلے لے چکا ہے",
    english: "Already taken",
    panel: "bg-danger text-white",
    badge: "bg-white/20",
  },
  unknown_person: {
    icon: HelpCircle,
    urdu: "پہچان نہیں ہوئی",
    english: "Not recognised",
    panel: "bg-charcoal text-charcoal-foreground",
    badge: "bg-white/15",
  },
  outside_window: {
    icon: Clock,
    urdu: "کھانے کا وقت نہیں",
    english: "Counter closed",
    panel: "bg-charcoal text-charcoal-foreground",
    badge: "bg-white/15",
  },
} as const;

/**
 * How long a result stays on screen.
 *
 * Long enough for the plate to be handed over, short enough that the next
 * person in the queue cannot mistake the last worker's green tick for their
 * own — which is the one way this screen could actively cause the problem it
 * exists to prevent.
 */
const SCAN_VISIBLE_MS = 25_000;

export function CounterScreen({
  scan,
  servedToday,
  refusedToday,
  canSeeCounts,
}: {
  scan: ScanView | null;
  servedToday: number;
  refusedToday: number;
  /** Tallies are management information, not something the counter needs. */
  canSeeCounts: boolean;
}) {
  // Which scan has timed out, rather than a boolean — a new scan then has a
  // different id and is visible again without needing to reset anything, so
  // the effect never has to write state synchronously to un-expire itself.
  const [expiredId, setExpiredId] = useState<string | null>(null);

  /*
   * Expiry runs on a timer rather than being decided server-side, so a result
   * clears itself exactly on time instead of whenever the next poll lands.
   * A scan that is already stale gets a zero-delay timer, which still fires
   * asynchronously — one frame late, and invisible on a screen polling every
   * five seconds.
   */
  useEffect(() => {
    if (!scan) return;

    const { id, scannedAt } = scan;
    const remaining = SCAN_VISIBLE_MS - (Date.now() - Date.parse(scannedAt));
    const timer = setTimeout(() => setExpiredId(id), Math.max(0, remaining));

    return () => clearTimeout(timer);
  }, [scan]);

  const visible = scan && expiredId !== scan.id ? scan : null;

  return (
    <div className="space-y-4 pb-6">
      {/* Fast, because this is watched live with a queue waiting. */}
      <AutoRefresh seconds={5} />

      {visible ? <ScanPanel scan={visible} /> : <IdlePanel />}

      {canSeeCounts ? (
        <div className="grid grid-cols-2 gap-3">
          <Tally
            value={servedToday}
            urdu="آج کھانا دیا"
            english="Served today"
            tone="text-success"
          />
          <Tally
            value={refusedToday}
            urdu="دوسری بار کوشش"
            english="Second attempts"
            tone={refusedToday > 0 ? "text-danger" : "text-muted-foreground"}
          />
        </div>
      ) : null}
    </div>
  );
}

function ScanPanel({ scan }: { scan: ScanView }) {
  const style = OUTCOME[scan.outcome];
  const Icon = style.icon;

  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-3xl px-6 py-10 text-center shadow-[0_18px_40px_rgb(0_0_0/0.18)]",
        style.panel,
      )}
      role="status"
      aria-live="polite"
    >
      <Icon className="size-28 shrink-0" strokeWidth={2.5} aria-hidden />

      {/* Generous leading: Nastaliq descends far below the baseline and gets
          clipped at the tighter line-heights the Latin type here uses. */}
      <p className="mt-4 text-4xl font-bold leading-[1.7] sm:text-5xl" lang="ur" dir="rtl">
        {style.urdu}
      </p>
      <p className="text-lg font-semibold uppercase tracking-wide opacity-80">{style.english}</p>

      {scan.photoUrl || scan.fullName ? (
        <div className="mt-6 flex flex-col items-center gap-3">
          {scan.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={scan.photoUrl}
              alt=""
              className="size-32 rounded-3xl border-4 border-white/40 object-cover"
            />
          ) : null}
          {scan.fullName ? (
            <div>
              <p className="text-2xl font-bold">{scan.fullName}</p>
              {scan.employeeCode ? (
                <p className="text-base font-semibold opacity-80">{scan.employeeCode}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Digits are the one thing everyone at this counter can read. */}
      {scan.earlierAt ? (
        <p
          className={cn("mt-6 rounded-2xl px-6 py-3 text-3xl font-bold tabular-nums", style.badge)}
        >
          {formatTime(scan.earlierAt)}
        </p>
      ) : null}

      {scan.mealName ? (
        <p className="mt-4 text-base font-semibold opacity-75">{scan.mealName}</p>
      ) : null}
    </div>
  );
}

/** Between scans: plainly waiting, never a stale result from the last person. */
function IdlePanel() {
  return (
    <div className="flex flex-col items-center rounded-3xl bg-secondary px-6 py-16 text-center">
      <UtensilsCrossed className="size-20 text-muted-foreground" aria-hidden />
      <p className="mt-4 text-3xl font-bold leading-[1.7] text-foreground" lang="ur" dir="rtl">
        انگلی لگائیں
      </p>
      <p className="text-base font-semibold uppercase tracking-wide text-muted-foreground">
        Scan a finger
      </p>
    </div>
  );
}

function Tally({
  value,
  urdu,
  english,
  tone,
}: {
  value: number;
  urdu: string;
  english: string;
  tone: string;
}) {
  return (
    <div className="rounded-2xl bg-secondary px-4 py-4 text-center">
      <p className={cn("text-4xl font-bold tabular-nums", tone)}>{value}</p>
      <p className="mt-1 text-sm font-bold leading-[1.9] text-foreground" lang="ur" dir="rtl">
        {urdu}
      </p>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {english}
      </p>
    </div>
  );
}
