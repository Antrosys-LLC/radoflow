import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Download, FileText, Printer, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Card, SectionTitle, StatusBadge } from "@/components/ui-kit";
import { useApp, useVisibleEmployees } from "@/lib/app-context";
import { formatPKR, type Employee } from "@/data/demo";

export const Route = createFileRoute("/payroll")({
  head: () => ({
    meta: [
      { title: "Payroll & Payslips | Rado Dyeing and Textile" },
      {
        name: "description",
        content:
          "Review regular and overtime hours, gross pay, deductions and net pay, then generate payslips for every worker.",
      },
      { property: "og:title", content: "Payroll & Payslips | Rado Dyeing and Textile" },
      {
        property: "og:description",
        content: "Payroll processing table and one-click payslip generation for Rado Dyeing and Textile.",
      },
    ],
  }),
  component: PayrollPage,
});

function PayrollPage() {
  const employees = useVisibleEmployees();
  const { role } = useApp();
  const [slip, setSlip] = useState<Employee | null>(null);

  const totals = employees.reduce(
    (acc, e) => ({
      gross: acc.gross + e.gross,
      deductions: acc.deductions + e.deductions,
      net: acc.net + (e.gross - e.deductions),
    }),
    { gross: 0, deductions: 0, net: 0 },
  );

  return (
    <div className="space-y-5 pb-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SumCard label="Gross pay" value={formatPKR(totals.gross)} tone="text-foreground" />
        <SumCard label="Deductions" value={formatPKR(totals.deductions)} tone="text-danger" />
        <SumCard label="Net payable" value={formatPKR(totals.net)} tone="text-primary" />
      </div>

      <Card className="p-4 sm:p-6">
        <SectionTitle
          icon={Users}
          title="Payroll processing"
          subtitle={role === "Employee" ? "Your personal pay record" : `${employees.length} workers in scope`}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-separate border-spacing-y-2 text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 pb-2">Employee</th>
                <th className="px-4 pb-2">Department</th>
                <th className="px-4 pb-2">Class</th>
                <th className="px-4 pb-2 text-right">Reg. h</th>
                <th className="px-4 pb-2 text-right">OT h</th>
                <th className="px-4 pb-2 text-right">Gross</th>
                <th className="px-4 pb-2 text-right">Deductions</th>
                <th className="px-4 pb-2 text-right">Net</th>
                <th className="px-4 pb-2">Status</th>
                <th className="px-4 pb-2" />
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr
                  key={e.id}
                  className="bg-secondary/70 transition-all duration-300 ease-in-out hover:bg-primary-soft"
                >
                  <td className="rounded-l-2xl px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={e.name} />
                      <div>
                        <p className="font-semibold text-foreground">{e.name}</p>
                        <p className="text-xs text-muted-foreground">{e.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{e.department}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-card px-3 py-1 text-xs font-semibold text-foreground">
                      {e.classification}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{e.regularHours}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-warning">{e.otHours}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatPKR(e.gross)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-danger">- {formatPKR(e.deductions)}</td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums text-foreground">
                    {formatPKR(e.gross - e.deductions)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={e.status} />
                  </td>
                  <td className="rounded-r-2xl px-4 py-3 text-right">
                    <button
                      onClick={() => setSlip(e)}
                      className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-[0_10px_24px_rgb(239_86_25/0.25)] transition-all duration-300 ease-in-out hover:-translate-y-0.5"
                    >
                      <FileText className="size-4" />
                      Payslip
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {slip ? <PayslipSheet employee={slip} onClose={() => setSlip(null)} /> : null}
    </div>
  );
}

function SumCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold tracking-tight ${tone}`}>{value}</p>
    </Card>
  );
}

function PayslipSheet({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const net = employee.gross - employee.deductions;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-charcoal/40 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-lg rounded-3xl bg-card p-6 shadow-[0_18px_40px_rgb(0_0_0/0.18)]">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar name={employee.name} className="size-12" />
            <div>
              <p className="text-lg font-bold tracking-tight text-foreground">{employee.name}</p>
              <p className="text-xs text-muted-foreground">
                {employee.id} · {employee.department} · {employee.classification}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close payslip"
            className="flex size-10 items-center justify-center rounded-xl bg-secondary text-muted-foreground transition-all duration-300 ease-in-out hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-5 space-y-2">
          <Line label="Regular hours" value={`${employee.regularHours} h`} />
          <Line label="Overtime hours" value={`${employee.otHours} h`} />
          <Line label="Gross pay" value={formatPKR(employee.gross)} />
          <Line label="Statutory deductions" value={`- ${formatPKR(employee.deductions)}`} tone="text-danger" />
        </div>

        <div className="mt-4 rounded-2xl bg-primary-soft p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Net pay</p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-foreground">{formatPKR(net)}</p>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            onClick={() => toast.success("Payslip generated", { description: `${employee.name} · ${employee.id}` })}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-[0_12px_30px_rgb(239_86_25/0.28)] transition-all duration-300 ease-in-out hover:-translate-y-0.5"
          >
            <Download className="size-4" />
            Download
          </button>
          <button
            onClick={() => typeof window !== "undefined" && window.print()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-secondary px-4 py-3 text-sm font-semibold text-foreground transition-all duration-300 ease-in-out hover:bg-muted"
          >
            <Printer className="size-4" />
            Print
          </button>
        </div>
      </div>
    </div>
  );
}

function Line({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-secondary px-4 py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-bold ${tone ?? "text-foreground"}`}>{value}</span>
    </div>
  );
}
