# RadoFlow Payroll

Role & Objective:

Act as a Principal Product Designer & UI/UX Architect. Design a complete, highly intuitive, and modern web application interface for an Attendance & Payroll Management System for Rado Dyeing and Textile, engineered by Antrosys.

1. Visual Style & Aesthetic Guidelines

Design Language: Soft, ultra-smooth, fluid, and modern. Strictly NO harsh borders, heavy outlines, sharp corners, or brutalist design elements.

Border Radii & Elevation: Use generous curves (rounded-2xl / 16px to 24px for cards; rounded-xl for inputs/buttons). Use subtle, diffuse drop shadows (shadow-sm, shadow-md with low opacity) and smooth, tactile hover states.

Color Palette (Light Antrosys Theme):

Primary Background: Soft Cream / Ivory (#FAF3E1 or #FFFDF7).

Surface & Card Backgrounds: Pure White (#FFFFFF) with ultra-light cream borders (#EFE8D5).

Primary Brand Accent: Electric Fiery Orange (#EF5619) used selectively for call-to-action buttons, active indicators, highlights, and primary key metrics.

Secondary / Contrast Accents: Soft Deep Charcoal (#1A1A1A) for high-contrast headers, primary text, and executive navigation elements.

Status Indicators (Accessible & High Contrast):

Present / Approved: Soft Sage Green (#10B981 bg, #ECFDF5 light container)

Absent / Alert: Soft Crimson (#EF4444 bg, #FEF2F2 light container)

Pending / Review: Warm Amber (#F59E0B bg, #FFFBEB light container)

2. Accessibility & Ultra-Low Literacy UX Strategy

Iconography-First Interface: Pair every critical textual metric with prominent, color-coded Lucide icons (e.g., green checkmarks for present, red cross for absent, clock for overtime, wallet for payroll).

Visual Status Cards: Use big, glanceable stat widgets with visual progress rings, horizontal bar meters, and bold status badges so factory floor staff can navigate instantly without reading dense text.

Micro-Interactions: Smooth CSS transitions (transition-all duration-300 ease-in-out), pill-shaped toggles, and tactile feedback on tap/hover.

3. Screen Layouts & Structural Modules

Build a fully interconnected, modular navigation system containing the following linked panels:

A. Navigation & Hierarchy Header

Top rounded bar containing multi-factory context switcher (Factory 1 - Dyeing Unit, Factory 2 - Textile Unit), live datetime counter, ZKTeco K50 biometric sync status badge (Online - Syncing), and a smooth Role-Switcher (CEO, CFO, COO, Admin, Manager, Employee).

B. Executive / C-Level Dashboard View

Top Metric Row (Pill Cards): Real-time Headcount, Today's Attendance %, Total Gross Payroll, Monthly Budget Allocation, and Pending Approvals.

Real-Time Factory Overview: Departmental attendance breakdown (Spinning, Dyeing, Quality, Packaging) with visual radial progress dials.

Payroll Summary Widget: Breakdown of Gross Pay, Statutory Deductions, Tax Allocations, and Net Payroll with a one-click "Run & Sign-off Payroll" primary orange button.

C. Attendance & Shift Management Panel

Calendar & Shift Engine: Visual calendar widget allowing administrators to toggle short-notice off-days or mark weekends (Saturday/Sunday) as active workdays with a single click.

Dynamic Rate Indicators: Clear visual inputs for Standard Hourly Rate (8h), Overtime Multiplier, and Weekend/Off-Day Shift Multipliers.

ZKTeco K50 Log Stream: Live updating visual feed showing recent employee biometric check-ins with photo avatars, time, and department tags.

D. Payroll Processing & Payslip Module

Clean tabular layout with smooth rounded rows: Employee Name / ID | Department | Classification (Monthly / Hourly) | Regular Hours | OT Hours | Gross Pay | Deductions | Net Pay | Status.

Action button to instantly generate and trigger downloadable visual payslips.

E. CEO Super-Admin Control Center

Visual drag-and-drop or simple visual toggles to assign, escalate, or restrict granular permissions for any user across CFO, COO, Admin, and Manager accounts.

4. Component Output Expectations

Render clean, production-ready React / Tailwind CSS code (or interactive Figma frame specs).

Ensure logical visual flow, identical rounded component padding across all pages, seamless navigation linking, and an elegant, modern finish reflect Antrosys' high design standards.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/ef9dae82-9644-4321-b4f4-a9af69c20ed8).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
