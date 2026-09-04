import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, LogIn, LogOut, Radio } from "lucide-react";

import { AutoRefresh } from "@/components/auto-refresh";
import { Avatar, Card, SectionTitle } from "@/components/ui-kit";
import { requireAnyPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Live floor | Rado Dyeing and Textile" },
};

/**
 * How often this screen re-reads, in seconds.
 *
 * Faster than the thirty-second attendance default because this is the one
 * screen someone stands in front of watching the gate. It is still polling
 * rather than Realtime: punches only enter the database when the sync worker
 * fetches them from the terminals, so a websocket would deliver the same rows
 * on the same cadence while adding replication config and a failure mode.
 */
const LIVE_REFRESH_SECONDS = 10;

/** The most recent punches worth scrolling. Beyond this, use the reports screen. */
const FEED_LIMIT = 400;

export default async function LiveFeedPage() {
  await requireAnyPermission(["devices.view", "devices.manage"]);

  const supabase = await createClient();

  const [{ data: punches }, { data: staff }, { data: devices }] = await Promise.all([
    supabase
      .from("punches")
      .select("id, device_id, device_user_id, profile_id, punched_at, direction")
      .order("punched_at", { ascending: false })
      .limit(FEED_LIMIT),
    supabase
      .from("employee_directory")
      .select("id, full_name, employee_code")
      .eq("status", "active"),
    supabase.from("devices").select("id, name"),
  ]);

  const nameById = new Map((staff ?? []).map((s) => [s.id, s]));
  const deviceById = new Map((devices ?? []).map((d) => [d.id, d.name]));

  return (
    <div className="space-y-5 pb-6">
      <AutoRefresh seconds={LIVE_REFRESH_SECONDS} />

      <Link
        href="/devices"
        className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Biometric Devices
      </Link>

      <Card className="p-4 sm:p-6">
        <SectionTitle
          icon={Radio}
          title="Live floor"
          subtitle={`The last ${FEED_LIMIT} check-ins and check-outs, refreshing every ${LIVE_REFRESH_SECONDS} seconds`}
        />

        {!punches || punches.length === 0 ? (
          <div className="rounded-2xl bg-secondary p-8 text-center">
            <p className="text-sm font-semibold text-foreground">Nothing on the floor yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Scans appear here within seconds of a terminal uploading them.
            </p>
          </div>
        ) : (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
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
                    <p className="truncate text-xs text-muted-foreground">
                      {person?.employee_code ?? punch.device_user_id}
                      {punch.device_id ? ` · ${deviceById.get(punch.device_id) ?? "Terminal"}` : ""}
                      {" · "}
                      {formatDate(punch.punched_at)}
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
