"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Banknote, Save } from "lucide-react";
import { toast } from "sonner";

import { useDictionary } from "@/components/language-provider";
import { Card, SectionTitle } from "@/components/ui-kit";

import { saveMealPrice, type MealPriceResult } from "../price-actions";

const INITIAL: MealPriceResult = { ok: false, message: "" };

function SaveButton() {
  const t = useDictionary();
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-all hover:opacity-90 disabled:opacity-60"
    >
      <Save className="size-4" aria-hidden />
      {pending ? t.common.saving : t.common.save}
    </button>
  );
}

/** The price of one meal, which every serving from now on is recorded at. */
export function MealPriceCard({ price }: { price: number | null }) {
  const t = useDictionary();
  const router = useRouter();
  const [state, action] = useActionState(saveMealPrice, INITIAL);

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) {
      toast.success(state.message);
      router.refresh();
    } else {
      toast.error(state.message);
    }
    // `state` is the only trigger; the router is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Card className="p-4 sm:p-6">
      <SectionTitle
        icon={Banknote}
        title={t.canteenHistory.priceTitle}
        subtitle={t.canteenHistory.priceHint}
      />
      <form action={action} className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-xs font-bold text-muted-foreground">
            {t.canteenHistory.priceLabel}
          </span>
          <input
            type="number"
            name="price"
            min={0}
            step="0.01"
            inputMode="decimal"
            defaultValue={price ?? ""}
            placeholder="0"
            dir="ltr"
            className="mt-1 w-44 rounded-2xl border border-input bg-background px-4 py-3 font-latin text-sm text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/30"
          />
        </label>
        <SaveButton />
      </form>
    </Card>
  );
}
