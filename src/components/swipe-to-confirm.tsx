"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, ChevronsRight, Loader2 } from "lucide-react";

/**
 * A drag-the-whole-way control for changes that should not happen by accident.
 *
 * Editing someone's pay or access is not a click to be made while scrolling
 * past. Requiring the thumb to be carried the full width of the track makes the
 * gesture deliberate in a way a confirm dialog is not — a dialog trains people
 * to press "Yes" without reading it, while this cannot be completed absent-
 * mindedly.
 *
 * Exposed as a real slider rather than a button, so it is not a mouse-only
 * control: arrow keys, Home and End move the thumb, and reaching the end
 * confirms exactly as dragging there does.
 */

/** How far along the track counts as "carried all the way". */
const COMMIT_AT = 0.97;

/** One arrow-key press, as a fraction of the track. */
const KEY_STEP = 0.15;

export function SwipeToConfirm({
  label,
  confirmedLabel = "Saving…",
  onConfirm,
  disabled = false,
  pending = false,
  tone = "default",
}: {
  /** What the swipe will do, e.g. "Swipe to save pay". */
  label: string;
  confirmedLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
  /** Drives the spinner while the caller's action is in flight. */
  pending?: boolean;
  tone?: "default" | "danger";
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const labelId = useId();

  const locked = disabled || pending || confirmed;

  const commit = useCallback(() => {
    setConfirmed(true);
    setProgress(1);
    onConfirm();
  }, [onConfirm]);

  /*
   * Once the caller's action finishes, the control returns to its resting
   * state so the same row can be edited again. Keyed off `pending` falling
   * rather than a timer, so it never re-arms while the save is still running.
   */
  const wasPending = useRef(pending);
  useEffect(() => {
    if (wasPending.current && !pending) {
      setConfirmed(false);
      setProgress(0);
    }
    wasPending.current = pending;
  }, [pending]);

  function positionToProgress(clientX: number): number {
    const track = trackRef.current;
    if (!track) return 0;

    const bounds = track.getBoundingClientRect();
    // The thumb is square, so its own width is unreachable travel.
    const travel = bounds.width - bounds.height;
    if (travel <= 0) return 0;

    return Math.min(1, Math.max(0, (clientX - bounds.left - bounds.height / 2) / travel));
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (locked) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    setProgress(positionToProgress(event.clientX));
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging || locked) return;
    setProgress(positionToProgress(event.clientX));
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);

    // Anything short of the far end springs back. Stopping halfway is how
    // someone changes their mind, so it must not be treated as a decision.
    if (progress >= COMMIT_AT) commit();
    else setProgress(0);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (locked) return;

    const forward = event.key === "ArrowRight" || event.key === "ArrowUp";
    const back = event.key === "ArrowLeft" || event.key === "ArrowDown";

    if (!forward && !back && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();

    if (event.key === "Home") return setProgress(0);
    if (event.key === "End") return commit();

    const next = Math.min(1, Math.max(0, progress + (forward ? KEY_STEP : -KEY_STEP)));
    if (next >= COMMIT_AT) commit();
    else setProgress(next);
  }

  const fill = confirmed ? 1 : progress;
  const accent =
    tone === "danger"
      ? "bg-destructive text-destructive-foreground"
      : "bg-charcoal text-charcoal-foreground";

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={locked ? -1 : 0}
      aria-labelledby={labelId}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(fill * 100)}
      aria-valuetext={confirmed ? confirmedLabel : label}
      aria-disabled={locked}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={handleKeyDown}
      className={`relative h-12 w-full touch-none select-none overflow-hidden rounded-2xl border border-border bg-muted outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
        locked ? "cursor-default opacity-70" : "cursor-grab active:cursor-grabbing"
      }`}
    >
      {/* The trail behind the thumb, so progress reads at a glance. */}
      <div
        className={`absolute inset-y-0 left-0 ${accent} opacity-20`}
        style={{ width: `${fill * 100}%` }}
      />

      <span
        id={labelId}
        className="pointer-events-none absolute inset-0 flex items-center justify-center px-12 text-center text-sm font-semibold text-muted-foreground"
      >
        {pending || confirmed ? confirmedLabel : label}
      </span>

      <div
        className={`absolute top-1 flex size-10 items-center justify-center rounded-xl ${accent} shadow-sm ${
          dragging ? "" : "transition-[left] duration-200"
        }`}
        style={{ left: `calc(${fill * 100}% - ${fill * 44}px + 4px)` }}
      >
        {pending ? (
          <Loader2 className="size-5 animate-spin" />
        ) : confirmed ? (
          <Check className="size-5" />
        ) : (
          <ChevronsRight className="size-5" />
        )}
      </div>
    </div>
  );
}
