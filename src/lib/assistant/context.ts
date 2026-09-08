/**
 * What the person asking is looking at.
 *
 * The Ask assistant could always answer "how many were late today" because it
 * has tools that go and find out. What it could not do was answer "why is this
 * one wrong" — because "this" was a row on a screen it had never seen.
 *
 * A context is that row: a short subject line and a handful of already-loaded
 * facts, sent along with the question. It is not a replacement for the tools —
 * a follow-up about last month still goes and looks — it is the difference
 * between asking about the factory and asking about the thing under your
 * finger.
 *
 * Everything here is pure and has no SDK import, so the shaping and the size
 * limits can be tested directly. The route is what actually sends it.
 */

/** Which screen the question came from. Recorded, and named in the prompt. */
export type AskSurface =
  | "dashboard"
  | "attendance"
  | "attendance-log"
  | "register"
  | "payroll"
  | "payslip"
  | "person"
  | "pay"
  | "reports"
  | "canteen"
  | "devices"
  | "calendar"
  | "general";

export interface AskContext {
  surface: AskSurface;
  /** One line naming the record: a person, a period, a date range. */
  subject?: string;
  /**
   * The facts already on screen. Kept small on purpose — this is the row the
   * reader is pointing at, not a data dump, and every fact is billed as input
   * tokens on every question in the thread.
   */
  facts?: Record<string, unknown>;
}

const SURFACES: readonly AskSurface[] = [
  "dashboard",
  "attendance",
  "attendance-log",
  "register",
  "payroll",
  "payslip",
  "person",
  "pay",
  "reports",
  "canteen",
  "devices",
  "calendar",
  "general",
];

/** How the prompt names each surface. Plain words, not route names. */
const SURFACE_NAMES: Record<AskSurface, string> = {
  dashboard: "the dashboard",
  attendance: "the attendance screen",
  "attendance-log": "the attendance log",
  register: "the check in/out register",
  payroll: "a payroll run",
  payslip: "one person's payslip",
  person: "one person's record",
  pay: "the pay rates screen",
  reports: "the reports screen",
  canteen: "the canteen register",
  devices: "the biometric terminals screen",
  calendar: "the working calendar",
  general: "the app",
};

const MAX_SUBJECT = 120;
const MAX_FACTS = 40;
const MAX_FACT_LENGTH = 200;
/** The whole block, after shaping. A ceiling on what one question can cost. */
const MAX_CONTEXT_CHARS = 4000;

/**
 * Shapes whatever the browser sent into something safe to put in a prompt.
 *
 * The context arrives from the client like the question does, so it is
 * validated the same way rather than trusted: an unknown surface becomes
 * `general`, oversized values are cut, and anything that is not a primitive is
 * dropped rather than serialised. A nested object here would be a way to push
 * arbitrary volume through a prompt somebody else pays for.
 */
export function readAskContext(value: unknown): AskContext | null {
  if (!value || typeof value !== "object") return null;

  const { surface, subject, facts } = value as {
    surface?: unknown;
    subject?: unknown;
    facts?: unknown;
  };

  const resolvedSurface: AskSurface = SURFACES.includes(surface as AskSurface)
    ? (surface as AskSurface)
    : "general";

  const context: AskContext = { surface: resolvedSurface };

  if (typeof subject === "string" && subject.trim()) {
    context.subject = subject.trim().slice(0, MAX_SUBJECT);
  }

  if (facts && typeof facts === "object" && !Array.isArray(facts)) {
    const shaped: Record<string, unknown> = {};
    let kept = 0;

    for (const [key, raw] of Object.entries(facts as Record<string, unknown>)) {
      if (kept >= MAX_FACTS) break;
      if (raw === null || raw === undefined || raw === "") continue;

      if (typeof raw === "number" || typeof raw === "boolean") {
        shaped[key] = raw;
        kept += 1;
      } else if (typeof raw === "string") {
        shaped[key] = raw.slice(0, MAX_FACT_LENGTH);
        kept += 1;
      }
      // Anything else — an object, an array, a function — is dropped.
    }

    if (kept > 0) context.facts = shaped;
  }

  return context;
}

/**
 * The context as a paragraph for the system prompt.
 *
 * Written as instructions rather than as a data blob with no explanation: the
 * model has to know that these figures are what the reader can see, that a
 * question with no subject is probably about them, and that the tools remain
 * the authority for anything not listed. Returns an empty string when there is
 * nothing to say, so the caller can concatenate unconditionally.
 */
export function describeAskContext(context: AskContext | null): string {
  if (!context || context.surface === "general") {
    if (!context?.subject && !context?.facts) return "";
  }

  const lines: string[] = [
    `The person asking is looking at ${SURFACE_NAMES[context!.surface]}${
      context!.subject ? `: ${context!.subject}` : ""
    }.`,
  ];

  if (context!.facts) {
    lines.push(
      "These are the figures already on their screen. Treat a question with no other subject as being about this record, and prefer these figures over looking the same thing up again:",
      ...Object.entries(context!.facts).map(([key, value]) => `- ${key}: ${String(value)}`),
    );
    lines.push(
      "Anything not listed above is not on their screen — use your tools for it, and never infer a figure that is missing here.",
    );
  }

  return lines.join("\n").slice(0, MAX_CONTEXT_CHARS);
}
