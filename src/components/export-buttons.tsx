"use client";

import { useState } from "react";
import { FileDown, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";

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
  label = "Download",
  formats = ["xlsx", "pdf"],
}: {
  /** Matches the route segment: people, pay, attendance, payroll, payslip. */
  kind: string;
  params?: Record<string, string | undefined>;
  label?: string;
  formats?: ("xlsx" | "pdf")[];
}) {
  const [busy, setBusy] = useState<string | null>(null);

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
        toast.error(body?.error ?? `Could not build the file (${response.status}).`);
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

      toast.success(`${name} downloaded.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Download failed.");
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
          {label} Excel
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
          {label} PDF
        </button>
      ) : null}
    </div>
  );
}
