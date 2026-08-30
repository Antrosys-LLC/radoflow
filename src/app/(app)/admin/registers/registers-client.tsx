"use client";

import { useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ImagePlus,
  Loader2,
  ScanText,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";

import { Card, SectionTitle } from "@/components/ui-kit";
import { matchesPerson } from "@/lib/people/match";
import { todayInPakistan } from "@/lib/time";
import { cn } from "@/lib/utils";

import { importRegisterRows, type ReviewedRegisterRow } from "./actions";

/**
 * Digitizing paper registers.
 *
 * Photograph a page, Claude Vision proposes rows, a person matches each one
 * to a real employee and fixes anything misread — nothing reaches
 * attendance_days until that review is done. This is a one-page-at-a-time
 * tool on purpose: reviewing what an OCR pass produced is the part that
 * actually takes care, and a queue of unreviewed pages would just invite
 * skipping that step.
 */

export interface EmployeeOption {
  id: string;
  fullName: string;
  employeeCode: string;
}

type Status = "present" | "absent" | "leave" | "unclear";

interface DraftRow {
  key: string;
  nameAsWritten: string;
  workDate: string;
  status: Status;
  hoursWorked: string;
  note: string;
  profileId: string | null;
  query: string;
}

const INPUT =
  "w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/30";

function fileToBase64(file: File): Promise<{ base64: string; mediaType: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      const base64 = dataUrl.split(",")[1] ?? "";
      resolve({ base64, mediaType: file.type, dataUrl });
    };
    reader.readAsDataURL(file);
  });
}

let keyCounter = 0;
function nextKey(): string {
  keyCounter += 1;
  return `row-${keyCounter}`;
}

export function RegistersClient({
  sites,
  employees,
}: {
  sites: { id: string; name: string }[];
  employees: EmployeeOption[];
}) {
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [pageDate, setPageDate] = useState(todayInPakistan());
  const [preview, setPreview] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [pageNote, setPageNote] = useState<string | null>(null);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!siteId) {
      toast.error("Choose a factory first.");
      return;
    }

    setExtracting(true);
    setRows([]);
    setPageNote(null);

    try {
      const { base64, mediaType, dataUrl } = await fileToBase64(file);
      setPreview(dataUrl);

      const response = await fetch("/api/registers/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      });
      const body = (await response.json().catch(() => null)) as {
        rows?: {
          nameAsWritten: string;
          date: string | null;
          status: Status;
          hoursWorked: number | null;
          note: string | null;
        }[];
        pageNote?: string | null;
        error?: string;
      } | null;

      if (!response.ok || !body?.rows) {
        toast.error(body?.error ?? "Could not read that page.");
        return;
      }

      setPageNote(body.pageNote ?? null);
      setRows(
        body.rows.map((row) => ({
          key: nextKey(),
          nameAsWritten: row.nameAsWritten,
          workDate: row.date ?? pageDate,
          status: row.status,
          hoursWorked: row.hoursWorked != null ? String(row.hoursWorked) : "",
          note: row.note ?? "",
          profileId: null,
          query: row.nameAsWritten,
        })),
      );

      if (body.rows.length === 0) {
        toast.error("No rows found on that page — try a clearer photo.");
      }
    } catch {
      toast.error("Could not reach the assistant. Check your connection.");
    } finally {
      setExtracting(false);
    }
  }

  function updateRow(key: string, patch: Partial<DraftRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  const readyRows = rows.filter((r) => r.profileId && r.status !== "unclear" && r.workDate);
  const needsAttention = rows.length - readyRows.length;

  async function commit() {
    if (readyRows.length === 0) return;
    setImporting(true);

    const payload: ReviewedRegisterRow[] = readyRows.map((r) => ({
      profileId: r.profileId!,
      workDate: r.workDate,
      status: r.status as "present" | "absent" | "leave",
      hoursWorked: r.hoursWorked ? Number(r.hoursWorked) : null,
      note: r.note.trim() || null,
    }));

    try {
      const result = await importRegisterRows(siteId, payload);
      if (result.ok) {
        toast.success(result.message, { duration: 8000 });
        setRows([]);
        setPreview(null);
        setPageNote(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } else {
        toast.error(result.message, { duration: 8000 });
      }
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-5 pb-6">
      <Card className="p-4 sm:p-6">
        <SectionTitle
          icon={ScanText}
          title="Digitize a register"
          subtitle="Photograph a page — every row is reviewed before it's saved, nothing is imported automatically"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Factory
            </label>
            <select
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className={cn(INPUT, "mt-1")}
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Page date (used when a row has no date of its own)
            </label>
            <input
              type="date"
              value={pageDate}
              onChange={(e) => setPageDate(e.target.value)}
              className={cn(INPUT, "mt-1")}
            />
          </div>
        </div>

        <div className="mt-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          <button
            type="button"
            disabled={extracting || !siteId}
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-input bg-secondary px-4 py-8 text-center transition-all hover:border-primary hover:bg-primary-soft disabled:opacity-50"
          >
            {extracting ? (
              <>
                <Loader2 className="size-8 animate-spin text-primary" />
                <p className="text-sm font-semibold text-foreground">Reading the page…</p>
              </>
            ) : (
              <>
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="" className="max-h-40 rounded-xl object-contain" />
                ) : (
                  <ImagePlus className="size-8 text-muted-foreground" />
                )}
                <p className="text-sm font-semibold text-foreground">
                  {preview
                    ? "Photograph another page"
                    : "Take or choose a photo of a register page"}
                </p>
              </>
            )}
          </button>
        </div>

        {pageNote ? (
          <div className="mt-3 flex items-start gap-2 rounded-2xl bg-warning-soft px-4 py-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <p className="text-foreground">{pageNote}</p>
          </div>
        ) : null}
      </Card>

      {rows.length > 0 ? (
        <Card className="p-4 sm:p-6">
          <SectionTitle
            icon={UploadCloud}
            title={`Review · ${rows.length} row${rows.length === 1 ? "" : "s"}`}
            subtitle="Match each row to a real employee and fix anything misread — unmatched rows are not imported"
            action={
              <button
                type="button"
                disabled={importing || readyRows.length === 0}
                onClick={commit}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-[0_10px_24px_rgb(239_86_25/0.25)] transition-all hover:-translate-y-0.5 disabled:opacity-50"
              >
                {importing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                Import {readyRows.length} row{readyRows.length === 1 ? "" : "s"}
              </button>
            }
          />

          {needsAttention > 0 ? (
            <p className="mb-3 text-xs font-semibold text-warning">
              {needsAttention} row{needsAttention === 1 ? "" : "s"} need
              {needsAttention === 1 ? "s" : ""} a matched employee and a clear status before they
              can be imported.
            </p>
          ) : null}

          <div className="space-y-2">
            {rows.map((row) => (
              <RegisterRowEditor
                key={row.key}
                row={row}
                employees={employees}
                onChange={(patch) => updateRow(row.key, patch)}
                onRemove={() => removeRow(row.key)}
              />
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function RegisterRowEditor({
  row,
  employees,
  onChange,
  onRemove,
}: {
  row: DraftRow;
  employees: EmployeeOption[];
  onChange: (patch: Partial<DraftRow>) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);

  const matched = row.profileId ? employees.find((e) => e.id === row.profileId) : null;
  const matches = open
    ? employees
        .filter((e) =>
          matchesPerson({ full_name: e.fullName, employee_code: e.employeeCode }, row.query),
        )
        .slice(0, 8)
    : [];

  const incomplete = !row.profileId || row.status === "unclear" || !row.workDate;

  return (
    <div
      className={cn("rounded-2xl p-3 sm:p-4", incomplete ? "bg-warning-soft/60" : "bg-secondary")}
    >
      <div className="grid gap-2 sm:grid-cols-[1.5fr_1fr_1fr_0.8fr_1.5fr_auto] sm:items-start">
        <div className="relative">
          <label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            As written: &ldquo;{row.nameAsWritten}&rdquo;
          </label>
          <input
            value={row.query}
            onChange={(e) => {
              onChange({ query: e.target.value, profileId: null });
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Search employee…"
            className={cn(INPUT, matched ? "border-success" : "border-warning")}
          />
          {matched ? (
            <p className="mt-1 text-[11px] font-semibold text-success">
              Matched: {matched.fullName} ({matched.employeeCode})
            </p>
          ) : null}
          {open && matches.length > 0 ? (
            <div className="absolute z-10 mt-1 w-full rounded-xl border border-input bg-card shadow-lg">
              {matches.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => {
                    onChange({ profileId: e.id, query: e.fullName });
                    setOpen(false);
                  }}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-secondary"
                >
                  {e.fullName} <span className="text-muted-foreground">({e.employeeCode})</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Date
          </label>
          <input
            type="date"
            value={row.workDate}
            onChange={(e) => onChange({ workDate: e.target.value })}
            className={INPUT}
          />
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Status
          </label>
          <select
            value={row.status}
            onChange={(e) => onChange({ status: e.target.value as Status })}
            className={cn(INPUT, row.status === "unclear" && "border-warning")}
          >
            <option value="present">Present</option>
            <option value="absent">Absent</option>
            <option value="leave">Leave</option>
            <option value="unclear">Unclear — fix before import</option>
          </select>
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Hours
          </label>
          <input
            type="number"
            min="0"
            step="0.5"
            value={row.hoursWorked}
            onChange={(e) => onChange({ hoursWorked: e.target.value })}
            className={INPUT}
          />
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Note
          </label>
          <input
            value={row.note}
            onChange={(e) => onChange({ note: e.target.value })}
            className={INPUT}
          />
        </div>

        <div className="flex items-end justify-end pb-0.5 sm:pt-5">
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove this row"
            className="flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-all hover:bg-danger-soft hover:text-danger"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
