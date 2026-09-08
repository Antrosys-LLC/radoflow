"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Fill } from "@/components/fill";
import { useDictionary } from "@/components/language-provider";
import { PasswordInput } from "@/components/credential-inputs";
import { cn } from "@/lib/utils";

import { bulkUpdateUsers, type BulkAction } from "./actions";
import type { Option } from "./users-manager";

/**
 * One change, applied to everyone selected.
 *
 * A floating bar rather than a dialog: the selection is the context, and
 * hiding the list behind a modal to act on it would take away the only way to
 * check what is about to change. It appears when something is selected and
 * leaves when nothing is.
 *
 * Suspending in bulk asks for the acting person's password, exactly as
 * suspending one person does — the batch is a convenience over the single
 * action, not a way around its confirmation.
 */

export function BulkBar({
  selected,
  roles,
  departments,
  shifts,
  canManageAccess,
  onDone,
  onClear,
}: {
  selected: string[];
  roles: Option[];
  departments: Option[];
  shifts: Option[];
  canManageAccess: boolean;
  onDone: () => void;
  onClear: () => void;
}) {
  const t = useDictionary();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [action, setAction] = useState<BulkAction>("department");
  const [value, setValue] = useState("");
  const [password, setPassword] = useState("");

  const needsPassword = action === "suspend" || action === "reactivate";
  const needsValue = action === "role" || action === "department" || action === "shift";

  const options: { id: string; name: string }[] =
    action === "role" ? roles : action === "department" ? departments : shifts;

  function apply() {
    if (pending) return;

    startTransition(async () => {
      const result = await bulkUpdateUsers(selected, action, value, password);
      if (result.ok) {
        toast.success(result.message);
        setPassword("");
        onDone();
      } else {
        toast.error(result.message);
      }
      router.refresh();
    });
  }

  return (
    <div className="sticky bottom-3 z-30 mt-3 rounded-3xl border border-border bg-card p-3 shadow-[0_18px_40px_rgb(0_0_0/0.18)]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-2xl bg-primary-soft px-3 py-2 text-xs font-bold text-primary">
          <CheckSquare className="size-4" aria-hidden />
          <Fill template={t.users.selectedCount} values={{ count: selected.length }} />
        </span>

        <select
          value={action}
          onChange={(event) => {
            setAction(event.target.value as BulkAction);
            // The old value belongs to the old list — a department id left in
            // place while the action is now "shift" would be submitted.
            setValue("");
          }}
          aria-label={t.users.bulkAction}
          className="rounded-2xl border border-input bg-background px-3 py-2 text-xs font-semibold outline-none focus:border-primary"
        >
          <option value="department">{t.common.department}</option>
          <option value="shift">{t.users.shift}</option>
          {canManageAccess ? <option value="role">{t.users.role}</option> : null}
          <option value="suspend">{t.users.suspend}</option>
          <option value="reactivate">{t.users.reactivate}</option>
        </select>

        {needsValue ? (
          <select
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-label={t.users.bulkValue}
            className="min-w-[10rem] rounded-2xl border border-input bg-background px-3 py-2 text-xs font-semibold outline-none focus:border-primary"
          >
            <option value="">{action === "role" ? t.users.noRole : t.common.unassigned}</option>
            {/* Names come out of rows, so they are listed as stored. */}
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        ) : null}

        {needsPassword ? (
          <div className="min-w-[12rem] flex-1">
            <PasswordInput
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              placeholder={t.users.confirmWithPassword}
              className="w-full rounded-2xl border border-input bg-background px-3 py-2 text-xs outline-none focus:border-primary"
            />
          </div>
        ) : null}

        <button
          type="button"
          onClick={apply}
          disabled={pending || (needsPassword && password.length === 0)}
          className={cn(
            "ms-auto inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-bold transition-all disabled:opacity-50",
            action === "suspend" ? "bg-danger text-white" : "bg-primary text-primary-foreground",
          )}
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {t.users.applyToSelected}
        </button>

        <button
          type="button"
          onClick={onClear}
          aria-label={t.users.clearSelection}
          className="rounded-2xl bg-secondary p-2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      {needsPassword ? (
        <p className="mt-2 text-[11px] text-muted-foreground">{t.users.passwordWhyBulk}</p>
      ) : null}
    </div>
  );
}
