import type { Metadata } from "next";

import { redirect } from "next/navigation";

import { canUseAssistant } from "@/lib/auth/antrosys";
import { requireSession } from "@/lib/auth/session";
import { dictionaryFor } from "@/lib/i18n";

import { AssistantClient } from "./assistant-client";

export const metadata: Metadata = {
  title: { absolute: "Ask | Rado Dyeing and Textile" },
  description: "Ask a question about attendance, leave or payroll — by voice or text.",
};

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  // The role rather than the permission — the same gate the route and the
  // floating button use. See lib/auth/antrosys.ts.
  const session = await requireSession();
  if (!canUseAssistant(session)) redirect("/denied");
  /*
   * The same stand-in the app shell uses for the floating widget, so a profile
   * with no usable first name greets the same way on both surfaces.
   */
  const t = dictionaryFor(session.profile.language);

  return (
    <AssistantClient firstName={session.profile.fullName.split(" ")[0] ?? t.common.nameFallback} />
  );
}
