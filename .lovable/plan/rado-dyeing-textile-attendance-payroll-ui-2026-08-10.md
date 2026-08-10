# Rado Dyeing & Textile — Attendance & Payroll UI

A modern, soft, icon-first interface for factory attendance and payroll, built to the Antrosys design language. This first build is a fully navigable front-end with realistic demo data (no database yet), so the whole experience can be reviewed and refined before wiring a backend.

## Design system

- Background cream `#FFFDF7` / `#FAF3E1`, white cards with hairline cream borders `#EFE8D5`
- Brand accent: fiery orange `#EF5619` for CTAs, active states, key metrics
- Charcoal `#1A1A1A` for headers and primary text
- Status: sage green (present/approved), crimson (absent), amber (pending) each with soft tinted containers
- 16–24px card radius, xl radius on inputs/buttons, diffuse low-opacity shadows, no hard outlines
- 300ms ease-in-out transitions, pill toggles, tactile hover lift
- Lucide icons paired with every metric and status; big glanceable stat widgets, radial rings, bar meters

## Screens

1. **Shell + header** (shared on every page): factory switcher (Dyeing Unit / Textile Unit), live clock, ZKTeco K50 sync badge, role switcher (CEO, CFO, COO, Admin, Manager, Employee), soft side nav.
2. **Executive dashboard** `/` — pill metric row (headcount, attendance %, gross payroll, budget, pending approvals), departmental radial dials (Spinning, Dyeing, Quality, Packaging), payroll summary widget with "Run & Sign-off Payroll" orange CTA.
3. **Attendance & shifts** `/attendance` — calendar to toggle off-days and activate weekends, rate cards (standard hourly, OT multiplier, weekend/off-day multiplier), live ZKTeco K50 check-in feed with avatars, time, department tags.
4. **Payroll & payslips** `/payroll` — rounded-row table (employee, dept, classification, regular/OT hours, gross, deductions, net, status) with per-row payslip generation and a payslip preview sheet.
5. **Control center** `/admin` — permission matrix with pill toggles to grant, escalate, or restrict access per role and module.

Role switching changes what each screen shows (Employee sees only their own attendance/payslip; Manager sees their department; C-level sees everything).

## Technical notes

- TanStack Router file routes: `index.tsx`, `attendance.tsx`, `payroll.tsx`, `admin.tsx`, plus shared layout chrome in `__root.tsx`
- Tokens added to `src/styles.css` under `@theme inline` (cream surfaces, orange accent, status pairs) — no hardcoded colors in components
- Shared UI in `src/components/` (StatPill, RadialDial, StatusBadge, AppHeader, SideNav, RoleContext)
- Demo data in `src/data/` typed modules; role/factory state via React context
- Each route gets its own `head()` metadata (title, description, og)

## Not in this pass

Real biometric integration, database persistence, auth, and PDF export. Payslip download renders a print-ready view; real PDF/data wiring is a follow-up once the UI is approved.
