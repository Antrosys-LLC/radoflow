/**
 * PDF of every check-in on one gate between two clock times, for one day.
 *
 *   JITI_ALIAS='{"@":"E:/Rado/radoflow/src"}' npx jiti scripts/gate-checkins-pdf.ts 2026-10-14 06:00 23:30 "Main Gate — Check In"
 */
import { existsSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const envFile = new URL("../.env.local", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const { buildTablePdf } = await import("@/lib/export/pdf");
const { generatedStamp } = await import("@/lib/export/brand");

const [date, from, to, gate] = process.argv.slice(2);
const startIso = new Date(`${date}T${from}:00+05:00`).toISOString();
const endIso = new Date(`${date}T${to}:59.999+05:00`).toISOString();

const { data: device } = await supabase.from("devices").select("id,name").eq("name", gate!).single();
if (!device) throw new Error(`No terminal named ${gate}`);

const punches: any[] = [];
for (let offset = 0; ; offset += 1000) {
  const { data, error } = await supabase
    .from("punches")
    .select("punched_at,device_user_id,profile_id")
    .eq("device_id", device.id)
    .gte("punched_at", startIso)
    .lte("punched_at", endIso)
    .order("punched_at")
    .range(offset, offset + 999);
  if (error) throw error;
  punches.push(...data);
  if (data.length < 1000) break;
}

const ids = [...new Set(punches.map((p) => p.profile_id).filter(Boolean))];
const people = new Map<string, any>();
for (let i = 0; i < ids.length; i += 100) {
  const { data } = await supabase
    .from("profiles")
    .select("id,full_name,employee_code,device_pin,departments(name)")
    .in("id", ids.slice(i, i + 100));
  for (const p of data ?? []) people.set(p.id, p);
}

const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const rows = punches.map((p, i) => {
  const who = people.get(p.profile_id);
  return [
    i + 1,
    time.format(new Date(p.punched_at)),
    who?.employee_code ?? "—",
    who?.full_name ?? "Unknown person",
    who?.departments?.name ?? "—",
    p.device_user_id ?? who?.device_pin ?? "—",
  ];
});

const pdf = buildTablePdf({
  title: `${device.name} — Check-ins`,
  subtitle: `${date}, ${from} to ${to} PKT`,
  columns: [
    { header: "#", width: 28, align: "right" },
    { header: "Time", width: 62 },
    { header: "Code", width: 64 },
    { header: "Name", width: 170 },
    { header: "Department", width: 130 },
    { header: "Terminal ID", width: 60 },
  ],
  rows,
  highlights: [
    { label: "Check-ins", value: String(punches.length) },
    { label: "People", value: String(new Set(punches.map((p) => p.device_user_id)).size) },
  ],
  footer: generatedStamp(),
});
const out = `exports/gate-one-checkins-${date}.pdf`;
writeFileSync(out, pdf);
console.log(out, punches.length, "punches");
