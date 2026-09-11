"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { toast } from "sonner";

import { ApproverPicker } from "@/components/approver-picker";
import { Fill } from "@/components/fill";
import { useDictionary } from "@/components/language-provider";
import { Latin } from "@/components/latin";
import { Card, SectionTitle } from "@/components/ui-kit";
import { setContractAmount } from "@/lib/pay/actions";

const INITIAL = { ok: false, message: "" };

export interface ContractFirm {
  id: string;
  name: string;
  contractAmount: number;
  headcount: number;
}

/**
 * What each contract firm is owed for a month.
 *
 * One figure for the whole department, because that is what was agreed with
 * the firm. Payroll bills this once and prices none of the firm's people —
 * see `runPayrollForPeriod`.
 */
export function ContractFirms({ firms }: { firms: readonly ContractFirm[] }) {
  const t = useDictionary();

  return (
    <Card className="p-4 sm:p-6">
      <SectionTitle
        icon={Building2}
        title={t.rates.contractFirms}
        subtitle={t.rates.contractFirmsHint}
      />

      {firms.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{t.rates.noFirms}</p>
      ) : (
        <div className="mt-4 grid gap-3">
          {firms.map((firm) => (
            <FirmRow key={firm.id} firm={firm} />
          ))}
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">{t.rates.firmsFooter}</p>
    </Card>
  );
}

function FirmRow({ firm }: { firm: ContractFirm }) {
  const t = useDictionary();
  const [approverId, setApproverId] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function save() {
    const element = form.current;
    if (!element) return;
    const data = new FormData(element);

    startTransition(async () => {
      const result = await setContractAmount(INITIAL, data);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      router.refresh();
    });
  }

  return (
    <form
      ref={form}
      onSubmit={(event) => event.preventDefault()}
      className="flex flex-wrap items-end gap-3 rounded-2xl bg-secondary p-3"
    >
      <input type="hidden" name="department_id" value={firm.id} />
      <input type="hidden" name="approver_id" value={approverId} readOnly />

      <div className="min-w-[10rem] flex-1">
        {/* The firm is a department row, so its name is as the office typed
            it — a firm called "Al-Rehman Labour" in every language. */}
        <p className="text-sm font-semibold text-foreground">
          <Latin>{firm.name}</Latin>
        </p>
        <p className="text-xs text-muted-foreground">
          <Fill template={t.rates.onTheFloor} values={{ count: firm.headcount }} />
        </p>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-muted-foreground">{t.rates.monthlyAmount}</span>
        <input
          type="number"
          name="contract_amount"
          min={0}
          step="0.01"
          defaultValue={firm.contractAmount}
          className="w-40 rounded-xl border border-border bg-card px-3 py-2 text-sm"
        />
      </label>

      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {pending ? t.common.saving : t.common.save}
      </button>

      <div className="w-full">
        <ApproverPicker value={approverId} onChange={setApproverId} />
      </div>
    </form>
  );
}
