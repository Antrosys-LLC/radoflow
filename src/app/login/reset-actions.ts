"use server";

import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";

/**
 * The way back in for whoever maintains the system.
 *
 * Every other account here is recovered in person: the office sets a new
 * password from the user screen and tells the worker what it is. That works
 * because there is always somebody above them who can do it.
 *
 * The Antrosys administrator is the top of that chain, so there is nobody to
 * ask. The link goes to one fixed address — the one Antrosys reads — and never
 * to an address supplied with the request. That is the whole security property
 * of this action: it cannot be pointed anywhere, so nothing about who asked
 * for it matters, and it says the same thing whether the account exists or
 * not.
 */

/** Fixed at the module level so no caller can influence where the link goes. */
const ANTROSYS_EMAIL = "umar@antrosys.com";

export interface ResetResult {
  ok: boolean;
  message: string;
}

export async function requestAntrosysReset(): Promise<ResetResult> {
  const supabase = await createClient();

  /*
   * Where the link lands. Taken from the request's own host so this works on
   * localhost, on the Railway URL and on a custom domain without a build-time
   * setting to keep in step — and the path is fixed here rather than passed
   * in, for the same reason the address is.
   */
  const host = (await headers()).get("host") ?? "";
  const protocol = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  const redirectTo = `${protocol}://${host}/auth/reset`;

  const { error } = await supabase.auth.resetPasswordForEmail(ANTROSYS_EMAIL, { redirectTo });

  /*
   * The same answer either way. A different message for "no such account"
   * would confirm which addresses exist, and there is no version of this
   * screen where the person waiting for the email is helped by knowing.
   */
  if (error) {
    return {
      ok: true,
      message: `If that account exists, a reset link is on its way to ${ANTROSYS_EMAIL}.`,
    };
  }

  return {
    ok: true,
    message: `A reset link is on its way to ${ANTROSYS_EMAIL}. It expires in an hour.`,
  };
}
