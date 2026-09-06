import type { Metadata } from "next";
import { BadgeCheck } from "lucide-react";

import { Latin } from "@/components/latin";
import { Avatar, Card } from "@/components/ui-kit";
import { requireSession } from "@/lib/auth/session";
import { dictionaryFor } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatPKR } from "@/lib/time";

import { LanguageToggle } from "./language-toggle";

export const metadata: Metadata = {
  title: { absolute: "My Profile | Rado Dyeing and Textile" },
  description: "Your personal details and employment record.",
};

export const dynamic = "force-dynamic";

export default async function MyProfilePage() {
  const session = await requireSession();
  const t = dictionaryFor(session.profile.language);
  const supabase = await createClient();

  const [{ data: profile }, { data: sites }, { data: departments }, { data: shifts }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", session.userId).single(),
      supabase.from("sites").select("id, name"),
      supabase.from("departments").select("id, name"),
      supabase.from("shifts").select("id, name"),
    ]);

  /*
   * Site, department and shift names are data the office typed, not interface
   * strings: they render as stored, in whatever script they were entered, and
   * so are deliberately not wrapped in `<Latin>` either.
   */
  const siteName = sites?.find((s) => s.id === profile?.site_id)?.name ?? t.profile.notRecorded;
  const deptName =
    departments?.find((d) => d.id === profile?.department_id)?.name ?? t.profile.notRecorded;
  const shiftName = shifts?.find((s) => s.id === profile?.shift_id)?.name ?? t.profile.notRecorded;
  const roleLabel = session.roles.map((r) => r.name).join(" · ") || t.common.noRole;
  const monthly = profile?.pay_class === "monthly";

  return (
    <div className="space-y-5 pb-6">
      <Card className="p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={session.profile.fullName} className="size-16 text-lg" />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              <Latin>{session.profile.fullName}</Latin>
            </h1>
            <p className="text-sm text-muted-foreground">
              <Latin>{session.profile.employeeCode}</Latin> ·{" "}
              {profile?.designation ?? t.profile.noDesignation}
            </p>
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary">
              <BadgeCheck className="size-3.5" />
              {roleLabel}
            </span>
          </div>
        </div>

        <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Fact
            label={t.profile.employeeCode}
            value={<Latin>{session.profile.employeeCode}</Latin>}
          />
          <Fact
            label={t.profile.cnic}
            value={profile?.cnic ? <Latin>{profile.cnic}</Latin> : t.profile.notRecorded}
          />
          <Fact
            label={t.profile.phone}
            value={profile?.phone ? <Latin>{profile.phone}</Latin> : t.profile.notRecorded}
          />
          <Fact
            label={t.profile.email}
            value={
              session.profile.email ? <Latin>{session.profile.email}</Latin> : t.profile.notRecorded
            }
          />
          <Fact
            label={t.profile.designation}
            value={profile?.designation ?? t.profile.notRecorded}
          />
          {/* In `common`, not `profile`: the attendance log needs the same
              word, and one word has one home. */}
          <Fact label={t.common.department} value={deptName} />
          <Fact label={t.common.site} value={siteName} />
          <Fact label={t.profile.shift} value={shiftName} />
          <Fact
            label={t.profile.joinedOn}
            value={<Latin>{formatDate(profile?.joined_on)}</Latin>}
          />
          <Fact
            label={t.profile.payType}
            value={monthly ? t.profile.monthlySalary : t.profile.hourlyWage}
          />
          <Fact
            label={monthly ? t.profile.monthlySalary : t.profile.hourlyRate}
            value={
              <Latin>{formatPKR(monthly ? profile?.monthly_salary : profile?.hourly_rate)}</Latin>
            }
          />
          <Fact
            label={t.profile.clockInRequired}
            value={profile?.requires_attendance ? t.common.yes : t.common.no}
          />
          <Fact
            label={t.common.status}
            value={profile ? t.status.employment[profile.status] : t.profile.notRecorded}
          />
        </dl>

        <p className="mt-4 text-xs text-muted-foreground">{t.profile.managedByAdmin}</p>
      </Card>

      {/*
       * The one control on an otherwise read-only page, and a setting rather
       * than an edit to the record above it — so it sits in its own card below
       * that record instead of inside it, where a Save button would live.
       */}
      <LanguageToggle />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-secondary px-4 py-3">
      <dt className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      {/*
       * No `capitalize` on the value any more. It existed to make a raw
       * lowercase enum member presentable; the values now come from the
       * dictionary already written in their display form, and Urdu has no
       * letter case for it to act on at all.
       */}
      <dd className="mt-0.5 truncate text-sm font-bold text-foreground">{value}</dd>
    </div>
  );
}
