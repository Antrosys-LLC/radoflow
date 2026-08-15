import type { Metadata } from "next";

import { DashboardView } from "./dashboard-view";

export const metadata: Metadata = {
  // Absolute, not "Executive Dashboard": the root layout's title template does
  // not apply to app/page.tsx, which shares the root segment with that layout.
  title: { absolute: "Executive Dashboard | Rado Attendance & Payroll" },
  description:
    "Live headcount, attendance rate, departmental performance and payroll totals for Rado Dyeing and Textile factories.",
  openGraph: {
    title: "Executive Dashboard | Rado Attendance & Payroll",
    description: "Real-time factory attendance and payroll overview for Rado Dyeing and Textile.",
  },
};

export default function DashboardPage() {
  return <DashboardView />;
}
