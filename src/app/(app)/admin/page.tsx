import type { Metadata } from "next";

import { AdminView } from "./admin-view";

export const metadata: Metadata = {
  title: { absolute: "Control Center | Rado Dyeing and Textile" },
  description:
    "Super-admin control center to grant, escalate or restrict module access for every role.",
  openGraph: {
    title: "Control Center | Rado Dyeing and Textile",
    description: "Granular permission matrix for Operations, Manager and Employee accounts.",
  },
};

export default function AdminPage() {
  return <AdminView />;
}
