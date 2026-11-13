import { timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";

import type { Session } from "@/lib/auth/session";
import { phoneKey } from "@/lib/bot/phone";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Where a message came from, as far as secrecy goes.
 *
 * `private` is a one-to-one chat with the bot, `payroll` a group the office has
 * named as allowed to see pay, and `group` every other group. The bot decides
 * which it is from its own list of group ids; the server only decides what each
 * is allowed to ask for.
 */
export type ChatClass = "private" | "payroll" | "group";

/** Downloads that carry salaries. A general group never receives them. */
export const SENSITIVE_EXPORTS = new Set(["people", "pay", "payroll", "payslip", "register"]);

export function mayReceivePay(chat: ChatClass): boolean {
  return chat !== "group";
}

export type BotAuth =
  | { status: "absent" }
  | { status: "denied" }
  | { status: "unknown-sender" }
  | { status: "ok"; session: Session; chat: ChatClass };

function secretMatches(given: string): boolean {
  const expected = process.env["BOT_SECRET"] ?? "";
  // An unset secret must never let an empty header through.
  if (expected.length < 16 || given.length === 0) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function chatClass(raw: string | null): ChatClass {
  return raw === "private" || raw === "payroll" ? raw : "group";
}

/**
 * Finds the RadoFlow user behind a phone number and builds the same `Session`
 * a browser sign-in would — so every permission check downstream is the one the
 * website already uses, and the bot can never do more than the person could.
 *
 * Only an active profile with a matching phone qualifies. The match is on the
 * subscriber number, not the formatting.
 */
export async function sessionForPhone(phone: string): Promise<Session | null> {
  const key = phoneKey(phone);
  if (!key) return null;

  const supabase = createServiceClient();
  const { data: people } = await supabase
    .from("profiles")
    .select(
      "id, employee_code, full_name, email, photo_url, designation, site_id, department_id, pay_class, requires_attendance, phone",
    )
    .eq("status", "active")
    .not("phone", "is", null);

  const matches = (people ?? []).filter((p) => phoneKey(p.phone) === key);
  // Two people on one number is a data problem, and guessing which one is
  // asking would hand somebody else's access over.
  if (matches.length !== 1) return null;
  const profile = matches[0]!;

  const [{ data: roleRows }, { data: permissionRows }] = await Promise.all([
    supabase
      .from("user_roles")
      .select("roles(key, name, is_superuser, rank)")
      .eq("user_id", profile.id),
    supabase.rpc("permissions_of" as never, { p_user: profile.id } as never),
  ]);

  const roles = (
    (roleRows ?? []) as unknown as {
      roles: { key: string; name: string; is_superuser: boolean; rank: number } | null;
    }[]
  )
    .map((row) => row.roles)
    .filter((role): role is NonNullable<typeof role> => role !== null)
    .map((role) => ({
      key: role.key,
      name: role.name,
      isSuperuser: role.is_superuser,
      rank: role.rank,
    }))
    .sort((a, b) => a.rank - b.rank);

  const permissions = new Set(
    ((permissionRows ?? []) as unknown as (string | { permissions_of?: string })[]).map((entry) =>
      typeof entry === "string" ? entry : String(entry.permissions_of),
    ),
  );

  return {
    userId: profile.id,
    profile: {
      id: profile.id,
      employeeCode: profile.employee_code,
      fullName: profile.full_name,
      email: profile.email,
      photoUrl: profile.photo_url,
      designation: profile.designation,
      siteId: profile.site_id,
      departmentId: profile.department_id,
      payClass: profile.pay_class,
      requiresAttendance: profile.requires_attendance,
      language: "en",
    },
    roles,
    permissions,
    isSuperuser: roles.some((role) => role.isSuperuser),
    primaryRole: roles[0] ?? null,
  };
}

/**
 * Authenticates a request from the WhatsApp bot.
 *
 * `absent` means it is not a bot request at all (the browser path should carry
 * on); `denied` means it claimed to be and the secret was wrong. The two are
 * kept apart so a bad secret is refused instead of quietly falling through to
 * the cookie path.
 */
export async function authenticateBot(request: NextRequest): Promise<BotAuth> {
  const given = request.headers.get("x-bot-secret");
  if (given === null) return { status: "absent" };
  if (!secretMatches(given)) return { status: "denied" };

  const session = await sessionForPhone(request.headers.get("x-bot-phone") ?? "");
  if (!session) return { status: "unknown-sender" };

  return { status: "ok", session, chat: chatClass(request.headers.get("x-bot-chat")) };
}
