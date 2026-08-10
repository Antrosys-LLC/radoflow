import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Lock, ShieldCheck, ShieldAlert, Unlock } from "lucide-react";
import { toast } from "sonner";
import { Card, SectionTitle } from "@/components/ui-kit";
import { useApp } from "@/lib/app-context";
import { DEFAULT_PERMISSIONS, MODULES, type ModuleName } from "@/data/demo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Control Center | Rado Dyeing and Textile" },
      {
        name: "description",
        content: "CEO super-admin control center to grant, escalate or restrict module access for every role.",
      },
      { property: "og:title", content: "Control Center | Rado Dyeing and Textile" },
      {
        property: "og:description",
        content: "Granular permission matrix for CFO, COO, Admin, Manager and Employee accounts.",
      },
    ],
  }),
  component: AdminPage,
});

type Matrix = typeof DEFAULT_PERMISSIONS;

function AdminPage() {
  const { canAdmin, role } = useApp();
  const [matrix, setMatrix] = useState<Matrix>(() => structuredClone(DEFAULT_PERMISSIONS));

  if (!canAdmin) {
    return (
      <Card className="mx-auto max-w-md text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-danger-soft text-danger">
          <ShieldAlert className="size-6" />
        </span>
        <h1 className="mt-4 text-lg font-bold text-foreground">Restricted area</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The {role} role cannot open the control center. Switch to CEO or Admin to manage permissions.
        </p>
      </Card>
    );
  }

  const roles = Object.keys(matrix) as (keyof Matrix)[];

  function toggle(r: keyof Matrix, m: ModuleName) {
    setMatrix((prev) => {
      const next = structuredClone(prev);
      next[r][m] = !next[r][m];
      toast.success(next[r][m] ? `${r} granted ${m}` : `${r} restricted from ${m}`);
      return next;
    });
  }

  return (
    <div className="space-y-5 pb-6">
      <Card className="p-4 sm:p-6">
        <SectionTitle
          icon={ShieldCheck}
          title="Super-admin control center"
          subtitle="Tap a pill to grant, escalate or restrict access"
        />
        <div className="space-y-4">
          {roles.map((r) => {
            const granted = MODULES.filter((m) => matrix[r][m]).length;
            return (
              <div key={r} className="rounded-3xl bg-secondary p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex size-11 items-center justify-center rounded-2xl bg-charcoal text-sm font-bold text-charcoal-foreground">
                      {r.slice(0, 3)}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-foreground">{r}</p>
                      <p className="text-xs text-muted-foreground">
                        {granted} of {MODULES.length} modules enabled
                      </p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold sm:inline-flex",
                      granted > 3 ? "bg-success-soft text-success" : "bg-warning-soft text-warning",
                    )}
                  >
                    {granted > 3 ? <Unlock className="size-4" /> : <Lock className="size-4" />}
                    {granted > 3 ? "Elevated" : "Limited"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {MODULES.map((m) => {
                    const on = matrix[r][m];
                    return (
                      <button
                        key={m}
                        onClick={() => toggle(r, m)}
                        aria-pressed={on}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-semibold transition-all duration-300 ease-in-out hover:-translate-y-0.5",
                          on
                            ? "bg-primary text-primary-foreground shadow-[0_10px_24px_rgb(239_86_25/0.25)]"
                            : "bg-card text-muted-foreground",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-4 w-7 items-center rounded-full p-0.5 transition-all duration-300 ease-in-out",
                            on ? "bg-primary-foreground/40" : "bg-muted",
                          )}
                        >
                          <span
                            className={cn(
                              "size-3 rounded-full bg-card transition-all duration-300 ease-in-out",
                              on && "translate-x-3",
                            )}
                          />
                        </span>
                        {m}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
