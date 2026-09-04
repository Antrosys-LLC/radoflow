import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Fingerprint, LogIn, LogOut, Users } from "lucide-react";

import { ATTENDANCE_REFRESH_SECONDS, AutoRefresh } from "@/components/auto-refresh";
import { Avatar, Card, SectionTitle } from "@/components/ui-kit";
import { requireAnyPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatTime, timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";

import { DeviceDialog } from "../device-dialog";
import { DeviceControls } from "./device-controls";
import { EnrollmentManager } from "./enrollment-manager";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Terminal | Rado Dyeing and Textile" },
};

export default async function DeviceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  /*
   * The same pair the Biometric Devices menu entry and the list page ask for.
   * Guarding this on `devices.view` alone let a role holding only
   * `devices.manage` see the menu, open the list, and land on /denied when it
   * tapped a terminal — the drift `requireAnyPermission` exists to prevent.
   */
  const session = await requireAnyPermission(["devices.view", "devices.manage"]);
  const canManage = session.permissions.has("devices.manage");

  const supabase = await createClient();

  const { data: device } = await supabase.from("devices").select("*").eq("id", id).maybeSingle();

  if (!device) notFound();

  const [{ data: sites }, { data: enrollments }, { data: punches }, { data: staff }] =
    await Promise.all([
      supabase.from("sites").select("id, name").order("name"),
      supabase
        .from("device_enrollments")
        .select("id, device_user_id, profile_id, enrolled_at")
        .eq("device_id", id),
      supabase
        .from("punches")
        .select("id, device_user_id, profile_id, punched_at, direction, work_date")
        .eq("device_id", id)
        .order("punched_at", { ascending: false })
        .limit(25),
      supabase
        .from("employee_directory")
        .select("id, full_name, employee_code, department_id")
        .eq("status", "active")
        .order("full_name"),
    ]);

  const nameById = new Map((staff ?? []).map((s) => [s.id, s]));

  // Enrolment ids the terminal has sent that nobody has claimed yet — the most
  // common reason a worker's punches never reach their timesheet.
  const mappedIds = new Set((enrollments ?? []).map((e) => e.device_user_id));
  const unmapped = [
    ...new Set(
      (punches ?? [])
        .filter((p) => !p.profile_id && p.device_user_id)
        .map((p) => p.device_user_id as string),
    ),
  ].filter((deviceUserId) => !mappedIds.has(deviceUserId));

  return (
    <div className="space-y-5 pb-6">
      {/* Heartbeat and punches both land here without any action on this page. */}
      <AutoRefresh seconds={ATTENDANCE_REFRESH_SECONDS} />

      <Link
        href="/devices"
        className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        All terminals
      </Link>

      <Card className="p-4 sm:p-6">
        <SectionTitle
          icon={Fingerprint}
          title={device.name}
          subtitle={`${device.model} · serial ${device.serial_number ?? "—"} · last seen ${timeAgo(device.last_seen_at)}`}
          action={
            canManage ? (
              <DeviceDialog
                sites={sites ?? []}
                device={device}
                trigger={
                  <span className="inline-flex items-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold text-foreground transition-all hover:bg-primary-soft hover:text-primary">
                    Edit settings
                  </span>
                }
              />
            ) : null
          }
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Status"
            value={device.status}
            tone={device.status === "online" ? "good" : "bad"}
          />
          <Stat label="Mode" value={device.mode === "push" ? "Push (ADMS)" : "Pull (TCP)"} />
          <Stat
            label="Address"
            value={device.ip_address ? `${device.ip_address}:${device.port}` : "Not set"}
          />
          <Stat label="Timezone" value={device.timezone} />
        </div>

        {device.last_error ? (
          <p className="mt-4 rounded-2xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
            {device.last_error}
          </p>
        ) : null}

        {canManage ? (
          <DeviceControls
            deviceId={device.id}
            mode={device.mode}
            hasAddress={!!device.ip_address}
          />
        ) : null}

        {device.mode === "push" ? (
          <div className="mt-4 rounded-2xl bg-secondary p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Terminal setup
            </p>
            <p className="mt-1.5 text-sm text-foreground">
              On the terminal: <strong>Menu → Comm. → Cloud Server Setting</strong>. Set{" "}
              <strong>Server Mode</strong> to ADMS, then enter the address and port of whatever this
              terminal pushes to — the relay&apos;s static IP in a hosted setup, or this server
              directly if it shares the factory network. The firmware appends{" "}
              <code className="rounded bg-card px-1.5 py-0.5 text-xs">/iclock/cdata</code> itself.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Most ADMS builds accept digits only in that field, so a domain cannot be entered — and
              the address above is not the terminal&apos;s own{" "}
              <code className="rounded bg-card px-1.5 py-0.5 text-xs">192.168.x.x</code>, which is a
              common and silent mistake. Set <strong>Gateway</strong> under Ethernet too; without it
              the terminal never leaves the local network.
            </p>
          </div>
        ) : null}
      </Card>

      {canManage ? (
        <EnrollmentManager
          deviceId={device.id}
          enrollments={(enrollments ?? []).map((e) => ({
            id: e.id,
            deviceUserId: e.device_user_id,
            profileId: e.profile_id,
            employeeName: nameById.get(e.profile_id)?.full_name ?? "Unknown employee",
            employeeCode: nameById.get(e.profile_id)?.employee_code ?? "—",
          }))}
          unmapped={unmapped}
          // The directory is a view, so every column types as nullable even
          // though these are NOT NULL on the underlying table.
          staff={(staff ?? []).flatMap((s) =>
            s.id && s.full_name
              ? [{ id: s.id, name: s.full_name, code: s.employee_code ?? "—" }]
              : [],
          )}
        />
      ) : null}

      <Card className="p-4 sm:p-6">
        <SectionTitle
          icon={Users}
          title="Recent punches"
          subtitle="Newest first, shown in Pakistan Standard Time"
        />
        {!punches || punches.length === 0 ? (
          <div className="rounded-2xl bg-secondary p-8 text-center">
            <p className="text-sm font-semibold text-foreground">No punches received yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Once the terminal uploads, check-ins appear here within seconds.
            </p>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {punches.map((punch) => {
              const person = punch.profile_id ? nameById.get(punch.profile_id) : null;
              const isIn = punch.direction === "in";
              return (
                <div
                  key={punch.id}
                  className="flex items-center gap-3 rounded-2xl bg-secondary p-3"
                >
                  <Avatar name={person?.full_name ?? "??"} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {person?.full_name ?? (
                        <span className="text-warning">
                          Unlinked terminal ID {punch.device_user_id}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(punch.punched_at)} ·{" "}
                      {person?.employee_code ?? punch.device_user_id}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-bold",
                      isIn ? "text-success" : "text-info",
                    )}
                  >
                    {isIn ? <LogIn className="size-4" /> : <LogOut className="size-4" />}
                    {formatTime(punch.punched_at)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-2xl bg-secondary px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 truncate text-sm font-bold capitalize",
          tone === "good" && "text-success",
          tone === "bad" && "text-danger",
          !tone && "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}
