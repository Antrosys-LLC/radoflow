import { createClient } from "@/lib/supabase/server";

/**
 * Who can be asked to approve a change.
 *
 * The floor asked for "select any CEO", and that is what this lists: the
 * people holding a role that can actually decide. Antrosys is included because
 * on a factory with no CEO on the books — which is the state this system was
 * installed into — a request with nobody to send it to is a change that cannot
 * be made at all.
 *
 * Read through the caller's own session, so the list is the directory they can
 * already see. Roles are read rather than permissions because "a CEO" is what
 * the person picking is thinking of, and every superuser resolves to every
 * permission anyway, which would make a permission query return the same
 * people with a less honest name.
 */

export interface Approver {
  id: string;
  name: string;
  roleName: string;
}

export async function listApprovers(): Promise<Approver[]> {
  const supabase = await createClient();

  const { data: roles } = await supabase
    .from("roles")
    .select("id, name, key, is_superuser")
    .eq("is_superuser", true);

  const roleIds = (roles ?? []).map((role) => role.id);
  if (roleIds.length === 0) return [];

  const { data: holders } = await supabase
    .from("user_roles")
    .select("user_id, role_id")
    .in("role_id", roleIds);

  const ids = [...new Set((holders ?? []).map((row) => row.user_id))];
  if (ids.length === 0) return [];

  /*
   * The pay-free directory view, not `profiles`: a manager choosing an
   * approver needs a name, and has no business reading a director's salary to
   * get one.
   */
  const { data: people } = await supabase
    .from("employee_directory")
    .select("id, full_name")
    .in("id", ids)
    .order("full_name");

  const roleName = new Map((roles ?? []).map((role) => [role.id, role.name]));
  const roleOf = new Map((holders ?? []).map((row) => [row.user_id, row.role_id]));

  // The directory view types its columns as nullable; a row with no id is not
  // a person anybody can be asked to become.
  return (people ?? []).flatMap((person) =>
    person.id
      ? [
          {
            id: person.id,
            name: person.full_name ?? "",
            roleName: roleName.get(roleOf.get(person.id) ?? "") ?? "",
          },
        ]
      : [],
  );
}
