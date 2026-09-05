import type { Metadata } from "next";
import { BadgeCheck } from "lucide-react";

import { Avatar, Card } from "@/components/ui-kit";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatPKR } from "@/lib/time";

export const metadata: Metadata = {
  title: { absolute: "My Profile | Rado Dyeing and Textile" },
  description: "Your personal details and employment record.",
};

export const dynamic = "force-dynamic";

export default async function MyProfilePage() {
  const session = await requireSession();
  const supabase = await createClient();

  const [{ data: profile }, { data: sites }, { data: departments }, { data: shifts }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", session.userId).single(),
      supabase.from("sites").select("id, name"),
      supabase.from("departments").select("id, name"),
      supabase.from("shifts").select("id, name"),
    ]);

  const siteName = sites?.find((s) => s.id === profile?.site_id)?.name ?? "—";
  const deptName = departments?.find((d) => d.id === profile?.department_id)?.name ?? "—";
  const shiftName = shifts?.find((s) => s.id === profile?.shift_id)?.name ?? "—";
  const roleLabel = session.roles.map((r) => r.name).join(" · ") || "No role assigned";

  return (
    <div className="space-y-5 pb-6">
      <Card className="p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={session.profile.fullName} className="size-16 text-lg" />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {session.profile.fullName}
            </h1>
            <p className="text-sm text-muted-foreground">
              {session.profile.employeeCode} · {profile?.designation ?? "No designation"}
            </p>
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary">
              <BadgeCheck className="size-3.5" />
              {roleLabel}
            </span>
          </div>
        </div>

        <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Employee code" value={session.profile.employeeCode} />
          <Fact label="CNIC" value={profile?.cnic ?? "—"} />
          <Fact label="Phone" value={profile?.phone ?? "—"} />
          <Fact label="Email" value={session.profile.email ?? "—"} />
          <Fact label="Designation" value={profile?.designation ?? "—"} />
          <Fact label="Department" value={deptName} />
          <Fact label="Factory" value={siteName} />
          <Fact label="Shift" value={shiftName} />
          <Fact label="Joined" value={formatDate(profile?.joined_on)} />
          <Fact
            label="Pay type"
            value={profile?.pay_class === "monthly" ? "Monthly salary" : "Hourly wage"}
          />
          <Fact
            label={profile?.pay_class === "monthly" ? "Monthly salary" : "Hourly rate"}
            value={formatPKR(
              profile?.pay_class === "monthly" ? profile?.monthly_salary : profile?.hourly_rate,
            )}
          />
          <Fact label="Clock-in required" value={profile?.requires_attendance ? "Yes" : "No"} />
          <Fact label="Status" value={profile?.status ?? "—"} />
        </dl>

        <p className="mt-4 text-xs text-muted-foreground">
          These details are managed by your administrator. Contact them to make a change.
        </p>
      </Card>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-secondary px-4 py-3">
      <dt className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-sm font-bold capitalize text-foreground">{value}</dd>
    </div>
  );
}
