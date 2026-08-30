"use client";

import {
  CalendarClock,
  ClipboardCheck,
  Coins,
  Fingerprint,
  Gauge,
  LayoutDashboard,
  MessageCircleQuestion,
  ScanText,
  ScrollText,
  Settings2,
  ShieldCheck,
  UserCircle,
  UtensilsCrossed,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * Icon registry for the navigation.
 *
 * The menu is assembled on the server, and a React component is a function —
 * which cannot cross the server/client boundary. So navigation entries carry a
 * string key and the actual component is resolved here, on the client.
 */
export const NAV_ICONS = {
  dashboard: LayoutDashboard,
  assistant: MessageCircleQuestion,
  attendance: CalendarClock,
  calendar: ClipboardCheck,
  devices: Fingerprint,
  leave: ScrollText,
  people: Users,
  payroll: Wallet,
  rates: Coins,
  reports: Gauge,
  roles: ShieldCheck,
  registers: ScanText,
  canteen: UtensilsCrossed,
  users: UserCog,
  settings: Settings2,
  profile: UserCircle,
} as const satisfies Record<string, LucideIcon>;

export type NavIconName = keyof typeof NAV_ICONS;

export function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  const Icon = NAV_ICONS[name] ?? LayoutDashboard;
  return <Icon className={className} />;
}
