import type { NavIconName } from "@/components/nav-icons";
import type { Session } from "@/lib/auth/session";

/**
 * The menu is derived from permissions, not from a role name.
 *
 * That is what makes the Admin's "add a role" feature real: a new role picks up
 * whatever modules its granted permissions unlock, with no code change here.
 * Each entry declares what it needs; the shell shows what the user holds.
 *
 * `icon` is a string key rather than a component because this list is built on
 * the server and handed to a client component — functions cannot cross that
 * boundary. See components/nav-icons.tsx.
 */

export interface NavItem {
  href: string;
  label: string;
  icon: NavIconName;
  /** Shown when the user holds ANY of these. Empty means always visible. */
  requires: readonly string[];
  description?: string;
}

export interface NavSection {
  title: string;
  items: readonly NavItem[];
}

/**
 * Only routes that exist are listed. A menu entry pointing at an unbuilt page
 * is worse than a missing one — it reads as a broken system rather than an
 * unfinished one. Entries are added here as each module lands.
 */
const WORK_MODULES: readonly NavItem[] = [
  {
    href: "/",
    label: "Dashboard",
    icon: "dashboard",
    requires: [],
    description: "Your day at a glance",
  },
  {
    href: "/assistant",
    label: "Ask",
    icon: "assistant",
    requires: ["assistant.ask"],
    description: "Ask a question, by voice or text — Urdu, Roman Urdu or English",
  },
  {
    href: "/attendance",
    label: "Attendance",
    icon: "attendance",
    requires: ["attendance.view", "attendance.view.all"],
    description: "Daily attendance and corrections",
  },
  {
    href: "/attendance/register",
    label: "Check In / Out",
    icon: "attendance",
    requires: ["attendance.view", "attendance.view.all"],
    description: "Who came in today, and when",
  },
  {
    href: "/attendance/logs",
    label: "Attendance Log",
    icon: "attendance",
    requires: ["attendance.view", "attendance.view.all"],
    description: "Punches, hours and what they pay",
  },
  {
    href: "/devices",
    label: "Biometric Devices",
    icon: "devices",
    requires: ["devices.view", "devices.manage"],
    description: "ZKTeco K50 terminals",
  },
  {
    href: "/devices/live",
    label: "Live Floor",
    icon: "devices",
    requires: ["devices.view", "devices.manage"],
    description: "Check-ins and check-outs as they happen",
  },
  {
    href: "/rates",
    label: "Pay Rates",
    icon: "rates",
    requires: ["rates.view", "rates.manage"],
    description: "Overtime, weekend and late-arrival rules",
  },
  {
    href: "/canteen",
    label: "Canteen",
    icon: "canteen",
    requires: ["canteen.serve", "canteen.view"],
    description: "The serving counter, and who has eaten",
  },
  {
    href: "/reports",
    label: "Reports",
    icon: "reports",
    requires: ["reports.view"],
    description: "Attendance and pay across the factory",
  },
  {
    href: "/payroll",
    label: "Payroll",
    icon: "payroll",
    requires: ["payroll.view", "payroll.run"],
    description: "Pay runs and payslips",
  },
];

/** Governance — the Admin/CEO control surface. */
const GOVERNANCE_MODULES: readonly NavItem[] = [
  {
    href: "/admin/users",
    label: "User Accounts",
    icon: "users",
    requires: ["people.manage"],
    description: "Add users and grant individual access",
  },
  {
    href: "/admin/roles",
    label: "Roles & Access",
    icon: "roles",
    requires: ["access.manage"],
    description: "Create roles and choose what each can do",
  },
  {
    href: "/admin/registers",
    label: "Digitize Registers",
    icon: "registers",
    requires: ["registers.import"],
    description: "Photograph a paper register and import it, row by row",
  },
  {
    href: "/canteen/settings",
    label: "Canteen Settings",
    icon: "canteen",
    requires: ["canteen.manage"],
    description: "Serving times, and which terminals scan for meals",
  },
];

/**
 * Self-service. Everyone gets these regardless of role — the CEO still has
 * their own payslip to read.
 */
const SELF_MODULES: readonly NavItem[] = [
  { href: "/me/profile", label: "My Profile", icon: "profile", requires: [] },
];

function visible(items: readonly NavItem[], session: Session | null): NavItem[] {
  return items.filter(
    (item) => item.requires.length === 0 || item.requires.some((p) => session?.permissions.has(p)),
  );
}

/** The menu for this user, with empty sections dropped. */
export function navigationFor(session: Session | null): NavSection[] {
  const sections: NavSection[] = [
    { title: "Workspace", items: visible(WORK_MODULES, session) },
    { title: "Administration", items: visible(GOVERNANCE_MODULES, session) },
    { title: "My Records", items: visible(SELF_MODULES, session) },
  ];

  return sections.filter((section) => section.items.length > 0);
}

/**
 * Where a role lands after signing in.
 *
 * Ordered by how much of the business the permission implies, so Operations
 * opens on attendance rather than a payroll page it cannot read.
 */
export function landingPathFor(session: Session | null): string {
  if (!session) return "/login";
  if (session.isSuperuser) return "/";
  if (session.permissions.has("attendance.view.all")) return "/attendance";
  if (session.permissions.has("attendance.view")) return "/attendance";
  if (session.permissions.has("payroll.view")) return "/payroll";
  return "/me/profile";
}
