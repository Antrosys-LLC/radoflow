import type { Metadata } from "next";
import Link from "next/link";
import { Fingerprint, Plus, Wifi, WifiOff } from "lucide-react";

import { Card, SectionTitle } from "@/components/ui-kit";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";

import { DeviceDialog } from "./device-dialog";

export const metadata: Metadata = {
  title: { absolute: "Biometric Devices | Rado Dyeing and Textile" },
  description: "ZKTeco K50 terminal health, enrolment mapping and attendance sync.",
};

// Device health is live state; a cached page would show a stale heartbeat.
export const dynamic = "force-dynamic";

export default async function DevicesPage() {
  const session = await requirePermission("devices.view");
  const canManage = session.permissions.has("devices.manage");

  const supabase = await createClient();

  const [{ data: devices }, { data: sites }] = await Promise.all([
    supabase
      .from("devices")
      .select("id, name, model, serial_number, mode, ip_address, port, status, last_seen_at, last_error, is_active, site_id")
      .order("name"),
    supabase.from("sites").select("id, name").order("name"),
  ]);

  const siteName = new Map((sites ?? []).map((s) => [s.id, s.name]));

  return (
    <div className="space-y-5 pb-6">
      <Card className="p-4 sm:p-6">
        <SectionTitle
          icon={Fingerprint}
          title="Biometric terminals"
          subtitle="ZKTeco K50 devices on the factory floor"
          action={
            canManage ? (
              <DeviceDialog
                sites={sites ?? []}
                trigger={
                  <span className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-[0_10px_24px_rgb(239_86_25/0.25)] transition-all duration-300 hover:-translate-y-0.5">
                    <Plus className="size-4" />
                    Add terminal
                  </span>
                }
              />
            ) : null
          }
        />

        {!devices || devices.length === 0 ? (
          <div className="rounded-2xl bg-secondary p-8 text-center">
            <p className="text-sm font-semibold text-foreground">No terminals registered yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add your ZKTeco K50 and point it at this server to start receiving punches.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {devices.map((device) => {
              const online = device.status === "online";
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
                          online ? "bg-success-soft text-success" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {online ? <Wifi className="size-6" /> : <WifiOff className="size-6" />}
                      </span>
                      <div>
                        <p className="text-sm font-bold text-foreground">{device.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {siteName.get(device.site_id) ?? "Unassigned"} · {device.model}
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
                      {device.status}
                    </span>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <Detail label="Serial" value={device.serial_number ?? "—"} />
                    <Detail label="Mode" value={device.mode === "push" ? "Push (ADMS)" : "Pull (TCP)"} />
                    <Detail
                      label="Address"
                      value={device.ip_address ? `${device.ip_address}:${device.port}` : "—"}
                    />
                    <Detail label="Last seen" value={timeAgo(device.last_seen_at)} />
                  </dl>

                  {device.last_error ? (
                    <p className="mt-3 truncate rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
                      {device.last_error}
                    </p>
                  ) : device.last_seen_at ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Last punch received {formatDateTime(device.last_seen_at)}
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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 truncate font-semibold text-foreground">{value}</dd>
    </div>
  );
}
