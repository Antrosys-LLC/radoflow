"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { GitMerge } from "lucide-react";
import { toast } from "sonner";

import { useDictionary } from "@/components/language-provider";

import { mergeRosters } from "./actions";

/**
 * The button that makes the three terminals hold one roster.
 *
 * On the devices index rather than on a single terminal's page, because the
 * merge is about all of them at once — there is no terminal it belongs to. The
 * per-terminal button next to it, "Send every worker to this terminal", is the
 * different operation: that one repopulates one box from RadoFlow, this one
 * fills each box's gaps from the other two.
 *
 * Safe to press twice. A second run finds the same gaps already queued and
 * says nothing was needed.
 */
export function MergeRostersButton() {
  const t = useDictionary();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function merge() {
    startTransition(async () => {
      const toastId = toast.loading(t.devices.mergeRunning);
      const result = await mergeRosters();
      toast.dismiss(toastId);

      if (result.ok) toast.success(result.message, { duration: 8000 });
      else toast.error(result.message, { duration: 10000 });

      router.refresh();
    });
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={merge}
      className="inline-flex items-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold text-foreground transition-all duration-300 hover:bg-primary-soft hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
    >
      <GitMerge className="size-4" />
      {t.devices.mergeRosters}
    </button>
  );
}
