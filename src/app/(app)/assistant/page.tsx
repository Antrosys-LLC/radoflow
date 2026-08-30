import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth/session";

import { AssistantClient } from "./assistant-client";

export const metadata: Metadata = {
  title: { absolute: "Ask | Rado Dyeing and Textile" },
  description: "Ask a question about attendance, leave or payroll — by voice or text.",
};

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const session = await requirePermission("assistant.ask");

  return <AssistantClient firstName={session.profile.fullName.split(" ")[0] ?? "there"} />;
}
