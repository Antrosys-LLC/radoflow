import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { RegistersClient, type EmployeeOption } from "./registers-client";

export const metadata: Metadata = {
  title: { absolute: "Digitize Registers | Rado Dyeing and Textile" },
  description: "Photograph a paper attendance register and import it, reviewed row by row.",
};

export const dynamic = "force-dynamic";

export default async function RegistersPage() {
  await requirePermission("registers.import");
  const supabase = await createClient();

  const [{ data: sites }, { data: people }] = await Promise.all([
    supabase.from("sites").select("id, name").order("name"),
    supabase
      .from("employee_directory")
      .select("id, full_name, employee_code, department_id, status")
      .order("full_name"),
  ]);

  const employees: EmployeeOption[] = (people ?? [])
    .filter((p) => p.status === "active" && p.id && p.full_name && p.employee_code)
    .map((p) => ({
      id: p.id!,
      fullName: p.full_name!,
      employeeCode: p.employee_code!,
    }));

  return <RegistersClient sites={sites ?? []} employees={employees} />;
}
