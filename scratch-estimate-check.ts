import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { estimateSalaries } from "@/lib/payroll/estimate";

const envFile = new URL("./.env.local", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const { data: people } = await db
  .from("profiles")
  .select("id, full_name, worker_type, monthly_salary, duty_hours")
  .eq("status", "active")
  .limit(6);

const ids = (people ?? []).map((p) => p.id);
console.log("people", JSON.stringify(people));

const outcome = await estimateSalaries(db as never, ids, "2026-09-01", "2026-09-30");
console.log("usedDefaultRule", outcome.usedDefaultRule);
console.log("skipped", JSON.stringify(outcome.skipped));
for (const { employee, result } of outcome.estimates) {
  console.log(employee.fullName, {
    daysPresent: result.daysPresent,
    daysAbsent: result.daysAbsent,
    workingDays: result.workingDays,
    otHours: result.hours.overtime,
    basePay: result.basePay,
    otPay: result.otPay,
    latePenalty: result.latePenalty,
    gross: result.gross,
    net: result.net,
  });
}
