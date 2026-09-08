import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Fingerprint, Plus, Wifi, WifiOff } from "lucide-react";

import { Fill } from "@/components/fill";
import { Latin } from "@/components/latin";
import { Card, SectionTitle } from "@/components/ui-kit";
import { requireAnyPermission } from "@/lib/auth/session";
import { dictionaryFor } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";

import { DeviceDialog } from "./device-dialog";

export const metadata: Metadata = {
  title: { absolute: "Biometric Devices | Rado Dyeing and Textile" },
  description: "ZKTeco K50 terminal health, enrolment mapping and attendance sync.",
};

/**
 * The model these terminals are. A hardware name, so it is a value dropped
 * into the translated sentences through `<Fill>` rather than words written
 * into them — it stays Latin in every language, like the serial numbers and
 * addresses beside it.
 */
const MODEL = "ZKTeco K50";

// Device health is live state; a cached page would show a stale heartbeat.
export const dynamic = "force-dynamic";

export default async function DevicesPage() {
  const session = await requireAnyPermission(["devices.view", "devices.manage"]);
  const canManage = session.permissions.has("devices.manage");
  const t = dictionaryFor(session.profile.language);

  const supabase = await createClient();

  const [{ data: devices }, { data: sites }] = await Promise.all([
    supabase
      .from("devices")
      .select(
        "id, name, model, serial_number, mode, purpose, direction, ip_address, port, status, last_seen_at, last_error, is_active, site_id",
      )
      .order("name"),
    supabase.from("sites").select("id, name").order("name"),
  ]);

  const siteName = new Map((sites ?? []).map((s) => [s.id, s.name]));

  return (
    <div className="space-y-5 pb-6">
      <Card className="p-4 sm:p-6">
        <SectionTitle
          icon={Fingerprint}
          title={t.devices.title}
          subtitle={<Fill template={t.devices.subtitle} values={{ model: MODEL }} />}
          action={
            canManage ? (
              <DeviceDialog
                sites={sites ?? []}
                trigger={
                  <span className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-[0_10px_24px_rgb(239_86_25/0.25)] transition-all duration-300 hover:-translate-y-0.5">
                    <Plus className="size-4" />
                    {t.devices.addTerminal}
                  </span>
                }
              />
            ) : null
          }
        />

        {!devices || devices.length === 0 ? (
          <div className="rounded-2xl bg-secondary p-8 text-center">
            <p className="text-sm font-semibold text-foreground">{t.devices.noneYet}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              <Fill template={t.devices.noneYetHint} values={{ model: MODEL }} />
            </p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {devices.map((device) => {
              const online = device.status === "online";
              const factory = siteName.get(device.site_id);
              return (
                <Link
                  key={device.id}
                  href={`/devices/${device.id}`}
                  className="group rounded-3xl border border-border bg-card p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_rgb(0_0_0/0.09)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "flex size-12 items-center justify-center rounded-2xl",
                          online
                            ? "bg-success-soft text-success"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {online ? <Wifi className="size-6" /> : <WifiOff className="size-6" />}
                      </span>
                      <div>
                        <p className="flex items-center gap-2 text-sm font-bold text-foreground">
                          {/* A terminal's name is a name: wrapped, never translated. */}
                          <Latin>{device.name}</Latin>
                          {/* Worth calling out on the card: a terminal pointed at
                              the canteen records meals, and its scans will never
                              appear in the attendance register. */}
                          {device.purpose === "canteen" ? (
                            <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                              {t.status.devicePurpose.canteen}
                            </span>
                          ) : null}
                          {/* A gate terminal states its own direction, so the
                              card says which door it is on. `auto` says
                              nothing, and gets no badge. */}
                          {device.purpose !== "canteen" && device.direction !== "auto" ? (
                            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                              {t.status.deviceDirection[device.direction]}
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {/* The factory's name and the model are both Latin;
                              the stand-in for a missing factory is a word, so
                              it is not. */}
                          {factory ? <Latin>{factory}</Latin> : t.common.unassigned} ·{" "}
                          <Latin>{device.model}</Latin>
                        </p>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide",
                        online
                          ? "bg-success-soft text-success"
                          : device.status === "offline"
                            ? "bg-danger-soft text-danger"
                            : "bg-warning-soft text-warning",
                      )}
                    >
                      {t.status.device[device.status]}
                    </span>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <Detail
                      label={t.devices.serial}
                      value={<Latin>{device.serial_number ?? "—"}</Latin>}
                    />
                    <Detail label={t.devices.mode} value={t.status.deviceMode[device.mode]} />
                    <Detail
                      label={t.devices.address}
                      value={
                        <Latin>
                          {device.ip_address ? `${device.ip_address}:${device.port}` : "—"}
                        </Latin>
                      }
                    />
                    <Detail
                      label={t.devices.lastSeen}
                      value={
                        device.last_seen_at ? (
                          <Latin>{timeAgo(device.last_seen_at)}</Latin>
                        ) : (
                          t.devices.neverSeen
                        )
                      }
                    />
                  </dl>

                  {device.last_error ? (
                    // Whatever the terminal or the network said, passed through
                    // untouched and wrapped: it is a Latin technical string, not
                    // a sentence this app wrote, and translating it would hide
                    // what actually failed.
                    <p className="mt-3 truncate rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
                      <Latin>{device.last_error}</Latin>
                    </p>
                  ) : device.last_seen_at ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      <Fill
                        template={t.devices.lastPunchReceived}
                        values={{ time: formatDateTime(device.last_seen_at) }}
                      />
                    </p>
                  ) : null}
                </Link>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 truncate font-semibold text-foreground">{value}</dd>
    </div>
  );
}
