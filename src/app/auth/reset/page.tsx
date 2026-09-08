import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { ResetForm } from "./reset-form";

export const metadata: Metadata = {
  title: { absolute: "Set a new password | Rado Attendance & Payroll" },
  description: "Set a new password from a recovery link.",
};

export const dynamic = "force-dynamic";

/**
 * Where a recovery link lands.
 *
 * Supabase sends a link carrying a one-time code; exchanging it signs the
 * person in for exactly long enough to set a new password. That exchange
 * happens here, on the server, so the code never has to reach the browser's
 * history or a client component.
 *
 * A visit with no code is somebody who has bookmarked this page or whose link
 * has already been used. They are sent to sign in rather than shown a form
 * that cannot work — there is nothing to set a password *on*.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; error_description?: string }>;
}) {
  const { code, error_description: failed } = await searchParams;
  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      // An expired or already-spent link. Said plainly on the sign-in page
      // rather than as a stack trace here.
      redirect("/login?reason=reset-expired");
    }
  } else {
    const { data } = await supabase.auth.getUser();
    // No code and no session already established by one — nothing to do here.
    if (!data.user) redirect(failed ? "/login?reason=reset-expired" : "/login");
  }

  return <ResetForm />;
}
