/**
 * The daily register: one row per person, present or not.
 *
 * The live board answers "who is on the floor now" and the attendance log
 * answers "what did these days pay". Neither answers the question a supervisor
 * actually asks at the end of a shift — "who came in today, and when" — because
 * both show only people who have rows. A register has to list the people who
 * did *not* turn up, since those are the ones worth acting on.
 *
 * Kept pure and separate from the page so the absent-vs-present rules can be
 * tested without a database, the way chart geometry is separated from charts.
 */

export interface RegisterPerson {
  id: string;
  fullName: string;
  employeeCode: string;
  department: string | null;
  /** Monthly staff are often exempt; calling them absent would be wrong. */
  requiresAttendance: boolean;
}

/** One stored attendance day, reduced to what a register needs. */
export interface RegisterDay {
  profileId: string;
  firstIn: string | null;
  lastOut: string | null;
  hoursWorked: number;
  minutesLate: number;
  isLate: boolean;
}

/**
 * `working` is a check-in with no check-out yet — on today's register that is
 * someone still on the floor, and on a past date it is a missed check-out worth
 * correcting. Both need to be visible rather than rounded to "present".
 */
export type RegisterState = "present" | "working" | "absent" | "not_required";

export interface RegisterRow {
  person: RegisterPerson;
  checkIn: string | null;
  checkOut: string | null;
  hours: number;
  minutesLate: number;
  isLate: boolean;
  state: RegisterState;
}

export interface RegisterSummary {
  present: number;
  working: number;
  absent: number;
  notRequired: number;
  /** Counted alongside present rather than instead of it. */
  late: number;
  /** People the register expects to see: everyone attendance is required of. */
  expected: number;
}

function stateFor(person: RegisterPerson, day: RegisterDay | undefined): RegisterState {
  // A punch outranks the exemption: if a monthly employee did scan, the
  // register should show the hours rather than hide them behind "not required".
  if (!day || !day.firstIn) return person.requiresAttendance ? "absent" : "not_required";
  return day.lastOut ? "present" : "working";
}

/**
 * Merges the roster with the day's attendance rows.
 *
 * Sorted by name rather than by state: a register is read by scanning for a
 * person, and a list that reorders itself as people check in is unreadable.
 */
export function buildRegister(
  people: readonly RegisterPerson[],
  days: readonly RegisterDay[],
): RegisterRow[] {
  const byProfile = new Map(days.map((day) => [day.profileId, day]));

  return people
    .map((person) => {
      const day = byProfile.get(person.id);
      return {
        person,
        checkIn: day?.firstIn ?? null,
        checkOut: day?.lastOut ?? null,
        hours: day?.hoursWorked ?? 0,
        minutesLate: day?.minutesLate ?? 0,
        isLate: day?.isLate ?? false,
        state: stateFor(person, day),
      };
    })
    .sort((a, b) => a.person.fullName.localeCompare(b.person.fullName));
}

export function summarise(rows: readonly RegisterRow[]): RegisterSummary {
  const count = (state: RegisterState) => rows.filter((row) => row.state === state).length;

  return {
    present: count("present"),
    working: count("working"),
    absent: count("absent"),
    notRequired: count("not_required"),
    late: rows.filter((row) => row.isLate).length,
    expected: rows.filter((row) => row.person.requiresAttendance).length,
  };
}
