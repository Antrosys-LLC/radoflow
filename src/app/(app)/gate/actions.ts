"use server";

import { revalidatePath } from "next/cache";

import { requireAnyPermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Writing and correcting the gate register.
 *
 * The supervisor writes an entry as it happens and can correct it for an hour.
 * After that it is fixed unless a director changes it — which is the property
 * that makes the register evidence rather than a draft, and the reason the
 * same rule is written into the row policy as well as here. This half exists
 * to say *why* an edit was refused; the policy is what actually refuses it.
 */

export interface GateResult {
  ok: boolean;
  message: string;
}

/** How long the person who wrote an entry may keep correcting it. */
export const EDIT_WINDOW_MS = 60 * 60 * 1000;

const KINDS = ["visitor", "vehicle", "material", "staff"] as const;
const DIRECTIONS = ["in", "out"] as const;

type Kind = (typeof KINDS)[number];
type Direction = (typeof DIRECTIONS)[number];

function text(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

function readKind(value: string): Kind | null {
  return (KINDS as readonly string[]).includes(value) ? (value as Kind) : null;
}

function readDirection(value: string): Direction | null {
  return (DIRECTIONS as readonly string[]).includes(value) ? (value as Direction) : null;
}

/**
 * `datetime-local` gives wall-clock time with no zone. Anchored to Pakistan,
 * like every other clock reading here — a gate entry typed as 14:30 means half
 * past two at the gate, whatever the server thinks the time is.
 */
function instantFrom(value: string): string | null {
  if (!value) return new Date().toISOString();
  const parsed = new Date(`${value}:00+05:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export async function saveGateEntry(_prev: GateResult, form: FormData): Promise<GateResult> {
  const session = await requireAnyPermission(["gate.log", "gate.manage"]);

  const id = text(form, "id");
  const kind = readKind(text(form, "kind"));
  const direction = readDirection(text(form, "direction"));
  const subject = text(form, "subject");

  if (!kind) return { ok: false, message: "Choose what kind of entry this is." };
  if (!direction) return { ok: false, message: "Choose whether it is in or out." };
  if (!subject) return { ok: false, message: "Say who or what came through." };

  const happenedAt = instantFrom(text(form, "happened_at"));
  if (!happenedAt) return { ok: false, message: "That time could not be read." };

  const supabase = await createClient();

  const payload = {
    kind,
    direction,
    subject,
    party: text(form, "party") || null,
    purpose: text(form, "purpose") || null,
    reference: text(form, "reference") || null,
    quantity: text(form, "quantity") || null,
    remarks: text(form, "remarks") || null,
    happened_at: happenedAt,
    site_id: text(form, "site_id") || null,
  };

  if (!id) {
    const { error } = await supabase
      .from("gate_entries")
      .insert({ ...payload, recorded_by: session.userId });

    if (error) return { ok: false, message: error.message };

    revalidatePath("/gate");
    return { ok: true, message: "Written to the register." };
  }

  /*
   * An edit. The policy decides, but a refusal from it looks like "nothing
   * changed", so the two likely reasons are checked first and named: the hour
   * has passed, or it was somebody else's entry.
   */
  const { data: existing } = await supabase
    .from("gate_entries")
    .select("created_at, recorded_by")
    .eq("id", id)
    .maybeSingle();

  if (!existing) return { ok: false, message: "That entry is no longer there." };

  const mine = existing.recorded_by === session.userId;
  const withinHour = Date.now() - Date.parse(existing.created_at) < EDIT_WINDOW_MS;
  const unrestricted = session.isSuperuser || session.permissions.has("gate.manage");

  if (!unrestricted) {
    if (!mine) {
      return { ok: false, message: "That entry was written by somebody else." };
    }
    if (!withinHour) {
      return {
        ok: false,
        message: "The hour for correcting this has passed. Ask a director to change it.",
      };
    }
  }

  const { data, error } = await supabase
    .from("gate_entries")
    .update({ ...payload, edited_by: session.userId })
    .eq("id", id)
    .select("id");

  if (error) return { ok: false, message: error.message };
  if (!data || data.length === 0) {
    // An update refused by the policy matches no rows and raises nothing.
    return { ok: false, message: "Nothing changed — that entry is not yours to edit." };
  }

  revalidatePath("/gate");
  return { ok: true, message: "Corrected." };
}

/** Removing an entry is a director's act. A supervisor corrects instead. */
export async function deleteGateEntry(id: string): Promise<GateResult> {
  await requireAnyPermission(["gate.manage"]);

  if (!id) return { ok: false, message: "Nothing to remove." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("gate_entries").delete().eq("id", id).select("id");

  if (error) return { ok: false, message: error.message };
  if (!data || data.length === 0) return { ok: false, message: "Nothing was removed." };

  revalidatePath("/gate");
  return { ok: true, message: "Removed." };
}
