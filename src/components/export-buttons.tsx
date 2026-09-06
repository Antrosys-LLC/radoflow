"use client";

import { useState } from "react";
import { FileDown, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Fill } from "@/components/fill";
import { useDictionary } from "@/components/language-provider";
import { isolate } from "@/lib/i18n";

/**
 * Download buttons for the report screens.
 *
 * Fetched rather than linked, so a refusal shows as a message instead of
 * replacing the page with a JSON error body — the route answers 403 to anyone
 * without the capability, and a plain anchor would navigate straight into it.
 */
export function ExportButtons({
  kind,
  params = {},
  label,
  formats = ["xlsx", "pdf"],
}: {
  /** Matches the route segment: people, pay, attendance, payroll, payslip. */
  kind: string;
  params?: Record<string, string | undefined>;
  /**
   * The noun in the caption, already translated — the attendance log passes
   * `Payslip` beside the days that produced it. Left out, the button says
   * `Download`. It is not the whole caption: `common.downloadFormat` decides
   * where the format name goes relative to it.
   */
  label?: string;
  formats?: ("xlsx" | "pdf")[];
}) {
  const t = useDictionary();
  const [busy, setBusy] = useState<string | null>(null);

  /*
   * The caption is one dictionary sentence rather than `label` + " " + "PDF":
   * Urdu puts the format name first, and a caption assembled in code can only
   * ever be in English order.
   *
   * The noun is substituted here, by plain replace, because it is already
   * translated text — running it through `<Fill>` would set an Urdu word in a
   * Latin face and force it left-to-right. `{format}` is left for `<Fill>`,
   * because it is a format name, stays Latin in every language, and is the
   * only half that needs isolating.
   */
  const caption = t.common.downloadFormat.replace("{label}", label ?? t.common.download);

  async function download(format: "xlsx" | "pdf") {
    setBusy(format);

    try {
      const query = new URLSearchParams({ format });
      for (const [key, value] of Object.entries(params)) {
        if (value) query.set(key, value);
      }

      const response = await fetch(`/api/export/${kind}?${query.toString()}`);

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        /*
         * The route's own `error` is passed through untouched — it is the
         * server saying what it refused, and an invented Urdu sentence around
         * it would hide that. Only our fallback is translated; the status code
         * is a bare integer, so it needs no isolating.
         */
        toast.error(
          body?.error ?? t.common.downloadNotBuilt.replace("{status}", String(response.status)),
        );
        return;
      }

      const blob = await response.blob();
      /*
       * The filename comes from the response, not from here: the server already
       * decided it, and a second guess would drift from it.
       */
      const disposition = response.headers.get("content-disposition") ?? "";
      const name = disposition.match(/filename="([^"]+)"/)?.[1] ?? `${kind}.${format}`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.append(link);
      link.click();
      link.remove();
      // Released on the next tick; revoking immediately cancels the download
      // in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      /*
       * The filename is a Latin run — `attendance-2026-09.xlsx` — and a toast
       * inherits the page's `dir="rtl"` in Urdu, where a plain string has no
       * `<bdi>` to protect it. `isolate()` is that protection for a value
       * going into a `string`.
       */
      toast.success(t.common.downloaded.replace("{name}", isolate(name)));
    } catch (error) {
      // A fetch error is a raw runtime message: developer-facing, left as it
      // came. Only the fallback is ours to translate.
      toast.error(error instanceof Error ? error.message : t.common.downloadFailed);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {formats.includes("xlsx") ? (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => download("xlsx")}
          className="inline-flex items-center gap-1.5 rounded-xl bg-secondary px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:text-primary disabled:opacity-50"
        >
          {busy === "xlsx" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <FileSpreadsheet className="size-3.5" />
          )}
          <Fill template={caption} values={{ format: "Excel" }} />
        </button>
      ) : null}

      {formats.includes("pdf") ? (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => download("pdf")}
          className="inline-flex items-center gap-1.5 rounded-xl bg-secondary px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:text-primary disabled:opacity-50"
        >
          {busy === "pdf" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <FileDown className="size-3.5" />
          )}
          <Fill template={caption} values={{ format: "PDF" }} />
        </button>
      ) : null}
    </div>
  );
}
