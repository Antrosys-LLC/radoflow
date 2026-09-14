"use client";

import {
  Activity,
  CalendarClock,
  CalendarRange,
  ChartColumn,
  ChefHat,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  Coins,
  DoorOpen,
  Fingerprint,
  HandCoins,
  History,
  LayoutDashboard,
  LogIn,
  Settings2,
  ShieldCheck,
  UserCircle,
  UtensilsCrossed,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";

import { ClaudeIcon, type IconComponent } from "@/components/claude-icon";

/**
 * Icon registry for the navigation.
 *
 * The menu is assembled on the server, and a React component is a function —
 * which cannot cross the server/client boundary. So navigation entries carry a
 * string key and the actual component is resolved here, on the client.
 */
/*
 * One icon per menu entry, and no two alike: a sidebar with three identical
 * calendars under Attendance reads as three links to the same page.
 */
export const NAV_ICONS = {
  dashboard: LayoutDashboard,
  assistant: ClaudeIcon,
  attendance: CalendarClock,
  checkInOut: LogIn,
  attendanceLog: ClipboardList,
  calendar: CalendarRange,
  devices: Fingerprint,
  liveFloor: Activity,
  gate: DoorOpen,
  leave: ClipboardCheck,
  people: Users,
  payroll: Wallet,
  salaries: HandCoins,
  rates: Coins,
  reports: ChartColumn,
  roles: ShieldCheck,
  canteen: UtensilsCrossed,
  canteenHistory: History,
  canteenSettings: ChefHat,
  claudeSpend: CircleDollarSign,
  users: UserCog,
  settings: Settings2,
  profile: UserCircle,
} as const satisfies Record<string, IconComponent>;

export type NavIconName = keyof typeof NAV_ICONS;

export function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  const Icon = NAV_ICONS[name] ?? LayoutDashboard;
  return <Icon className={className} />;
}
