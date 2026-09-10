import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeft, Fingerprint, LogIn, LogOut, Users } from "lucide-react";

import { ATTENDANCE_REFRESH_SECONDS, AutoRefresh } from "@/components/auto-refresh";
import { Fill } from "@/components/fill";
import { Latin } from "@/components/latin";
import { Avatar, Card, SectionTitle } from "@/components/ui-kit";
import { requireAnyPermission } from "@/lib/auth/session";
import { dictionaryFor } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatTime, timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";

import { DeviceDialog } from "../device-dialog";
import { DeviceControls } from "./device-controls";
import { RosterSyncButton } from "./roster-sync";

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
  const t = dictionaryFor(session.profile.language);

  const supabase = await createClient();

  const { data: device } = await supabase.from("devices").select("*").eq("id", id).maybeSingle();

  if (!device) notFound();

  const [{ data: sites }, { data: punches }, { data: staff }, { data: queued }] = await Promise.all(
    [
      supabase.from("sites").select("id, name").order("name"),
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
      /*
       * Statuses rather than rows. The queue holds one row per person per
       * terminal, so a factory of four hundred produces twelve hundred of them
       * and this page has no use for any single one — only for whether the
       * terminal is keeping up, and whether anything was refused.
       */
      supabase.from("device_commands").select("status").eq("device_id", id),
    ],
  );

  const rosterCounts = {
    pending: 0,
    sent: 0,
    done: 0,
    failed: 0,
  };
  for (const row of queued ?? []) {
    rosterCounts[row.status as keyof typeof rosterCounts] += 1;
  }

  const nameById = new Map((staff ?? []).map((s) => [s.id, s]));

  return (
    <div className="space-y-5 pb-6">
      {/* Heartbeat and punches both land here without any action on this page. */}
      <AutoRefresh seconds={ATTENDANCE_REFRESH_SECONDS} />

      <Link
        href="/devices"
        className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4 rtl-flip" />
        {t.devices.allTerminals}
      </Link>

      <Card className="p-4 sm:p-6">
        <SectionTitle
          icon={Fingerprint}
          title={<Latin>{device.name}</Latin>}
          subtitle={
            // Three values, all of them Latin, in a sentence the translations
            // are free to reorder around them.
            <Fill
              template={t.devices.detailSubtitle}
              values={{
                model: device.model,
                serial: device.serial_number ?? "—",
                seen: device.last_seen_at ? timeAgo(device.last_seen_at) : t.devices.neverSeen,
              }}
            />
          }
          action={
            canManage ? (
              <DeviceDialog
                sites={sites ?? []}
                device={device}
                trigger={
                  <span className="inline-flex items-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold text-foreground transition-all hover:bg-primary-soft hover:text-primary">
                    {t.devices.editSettings}
                  </span>
                }
              />
            ) : null
          }
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label={t.common.status}
            value={t.status.device[device.status]}
            tone={device.status === "online" ? "good" : "bad"}
          />
          <Stat label={t.devices.mode} value={t.status.deviceMode[device.mode]} />
          <Stat
            label={t.devices.address}
            value={
              device.ip_address ? (
                <Latin>{`${device.ip_address}:${device.port}`}</Latin>
              ) : (
                t.devices.notSet
              )
            }
          />
          <Stat label={t.devices.timezone} value={<Latin>{device.timezone}</Latin>} />
        </div>

        {device.last_error ? (
          // Passed through untouched and wrapped: whatever the terminal or the
          // network said is a Latin technical string, not a sentence this app
          // wrote, and translating it would hide what actually failed.
          <p className="mt-4 rounded-2xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
            <Latin>{device.last_error}</Latin>
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
              {t.devices.setupTitle}
            </p>
            {/* Every slot below is a label on the terminal's own screen or a
                protocol name. They are values rather than words in the
                sentence because the installer reads them off the device
                exactly as they are, in every language — and because Urdu
                wants the sentence in a different order around them. */}
            <p className="mt-1.5 text-sm text-foreground">
              <Fill
                template={t.devices.setupCloudServer}
                values={{
                  menu: <strong>Menu → Comm. → Cloud Server Setting</strong>,
                  serverMode: <strong>Server Mode</strong>,
                  adms: "ADMS",
                  path: (
                    <code className="rounded bg-card px-1.5 py-0.5 text-xs">/iclock/cdata</code>
                  ),
                }}
              />
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              <Fill
                template={t.devices.setupDigitsOnly}
                values={{
                  adms: "ADMS",
                  ip: <code className="rounded bg-card px-1.5 py-0.5 text-xs">192.168.x.x</code>,
                  gateway: <strong>Gateway</strong>,
                  ethernet: <strong>Ethernet</strong>,
                }}
              />
            </p>
          </div>
        ) : null}
      </Card>

      {/*
        The roster, which is a different question from attendance: these
        numbers say whether this terminal knows who everybody is, not whether
        anybody has walked past it.
      */}
      <Card className="p-4 sm:p-6">
        <SectionTitle
          icon={Fingerprint}
          title={t.devices.rosterSync}
          subtitle={t.devices.rosterSyncNote}
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={t.devices.rosterQueuedCount} value={String(rosterCounts.pending)} />
          <Stat label={t.devices.rosterSentCount} value={String(rosterCounts.sent)} />
          <Stat
            label={t.devices.rosterDoneCount}
            value={String(rosterCounts.done)}
            {...(rosterCounts.done > 0 ? { tone: "good" as const } : {})}
          />
          <Stat
            label={t.devices.rosterFailedCount}
            value={String(rosterCounts.failed)}
            {...(rosterCounts.failed > 0 ? { tone: "bad" as const } : {})}
          />
        </div>

        {rosterCounts.failed > 0 ? (
          <p className="mt-4 rounded-2xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
            {t.devices.rosterFailedNote}
          </p>
        ) : null}

        {canManage ? <RosterSyncButton deviceId={device.id} /> : null}
      </Card>

      <Card className="p-4 sm:p-6">
        <SectionTitle
          icon={Users}
          title={t.devices.recentPunches}
          subtitle={t.devices.recentPunchesHint}
        />
        {!punches || punches.length === 0 ? (
          <div className="rounded-2xl bg-secondary p-8 text-center">
            <p className="text-sm font-semibold text-foreground">{t.devices.noPunches}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t.devices.noPunchesHint}</p>
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
                      {person?.full_name ? (
                        <Latin>{person.full_name}</Latin>
                      ) : (
                        <span className="text-warning">
                          <Fill
                            template={t.devices.unlinkedTerminalId}
                            values={{ id: punch.device_user_id }}
                          />
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <Latin>{formatDate(punch.punched_at)}</Latin> ·{" "}
                      <Latin>{person?.employee_code ?? punch.device_user_id}</Latin>
                    </p>
                  </div>
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-bold",
                      isIn ? "text-success" : "text-info",
                    )}
                  >
                    {isIn ? <LogIn className="size-4" /> : <LogOut className="size-4" />}
                    <Latin className="tabular-nums">{formatTime(punch.punched_at)}</Latin>
                    <span className="font-extrabold">
                      {isIn ? t.common.checkedIn : t.common.checkedOut}
                    </span>
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

function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-2xl bg-secondary px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      {/* `capitalize` is gone with the raw enum it existed for: these values are
          now dictionary labels, already cased for their own language. */}
      <p
        className={cn(
          "mt-0.5 truncate text-sm font-bold",
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
