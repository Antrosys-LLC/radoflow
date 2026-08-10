export type Role = "CEO" | "CFO" | "COO" | "Admin" | "Manager" | "Employee";
export const ROLES: Role[] = ["CEO", "CFO", "COO", "Admin", "Manager", "Employee"];

export type FactoryId = "dyeing" | "textile";
export const FACTORIES: { id: FactoryId; name: string; short: string }[] = [
  { id: "dyeing", name: "Factory 1 — Dyeing Unit", short: "Dyeing Unit" },
  { id: "textile", name: "Factory 2 — Textile Unit", short: "Textile Unit" },
];

export type Department = "Spinning" | "Dyeing" | "Quality" | "Packaging";
export const DEPARTMENTS: Department[] = ["Spinning", "Dyeing", "Quality", "Packaging"];

export type AttendanceStatus = "present" | "absent" | "pending";

export interface Employee {
  id: string;
  name: string;
  department: Department;
  factory: FactoryId;
  classification: "Monthly" | "Hourly";
  regularHours: number;
  otHours: number;
  hourlyRate: number;
  gross: number;
  deductions: number;
  status: AttendanceStatus;
}

function money(n: number) {
  return Math.round(n);
}

const seed: Omit<Employee, "gross" | "deductions">[] = [
  { id: "RD-1041", name: "Ayesha Khan", department: "Dyeing", factory: "dyeing", classification: "Hourly", regularHours: 176, otHours: 18, hourlyRate: 320, status: "present" },
  { id: "RD-1042", name: "Imran Sheikh", department: "Spinning", factory: "dyeing", classification: "Monthly", regularHours: 176, otHours: 6, hourlyRate: 410, status: "present" },
  { id: "RD-1043", name: "Sana Yusuf", department: "Quality", factory: "dyeing", classification: "Hourly", regularHours: 168, otHours: 24, hourlyRate: 295, status: "pending" },
  { id: "RD-1044", name: "Bilal Ahmed", department: "Packaging", factory: "dyeing", classification: "Hourly", regularHours: 160, otHours: 0, hourlyRate: 270, status: "absent" },
  { id: "RD-1045", name: "Nadia Rehman", department: "Dyeing", factory: "dyeing", classification: "Monthly", regularHours: 176, otHours: 12, hourlyRate: 445, status: "present" },
  { id: "RD-2011", name: "Farhan Malik", department: "Spinning", factory: "textile", classification: "Hourly", regularHours: 176, otHours: 20, hourlyRate: 335, status: "present" },
  { id: "RD-2012", name: "Hina Zafar", department: "Quality", factory: "textile", classification: "Monthly", regularHours: 176, otHours: 4, hourlyRate: 480, status: "present" },
  { id: "RD-2013", name: "Kamran Iqbal", department: "Packaging", factory: "textile", classification: "Hourly", regularHours: 152, otHours: 8, hourlyRate: 260, status: "pending" },
  { id: "RD-2014", name: "Rabia Noor", department: "Dyeing", factory: "textile", classification: "Hourly", regularHours: 176, otHours: 16, hourlyRate: 310, status: "present" },
  { id: "RD-2015", name: "Usman Tariq", department: "Spinning", factory: "textile", classification: "Monthly", regularHours: 168, otHours: 0, hourlyRate: 400, status: "absent" },
];

export const EMPLOYEES: Employee[] = seed.map((e) => {
  const gross = money(e.regularHours * e.hourlyRate + e.otHours * e.hourlyRate * 1.5);
  return { ...e, gross, deductions: money(gross * 0.135) };
});

export const CURRENT_EMPLOYEE_ID = "RD-1041";

export interface CheckIn {
  id: string;
  employeeId: string;
  name: string;
  department: Department;
  factory: FactoryId;
  time: string;
  direction: "in" | "out";
}

export const CHECK_INS: CheckIn[] = [
  { id: "c1", employeeId: "RD-1041", name: "Ayesha Khan", department: "Dyeing", factory: "dyeing", time: "07:58", direction: "in" },
  { id: "c2", employeeId: "RD-1042", name: "Imran Sheikh", department: "Spinning", factory: "dyeing", time: "07:59", direction: "in" },
  { id: "c3", employeeId: "RD-2011", name: "Farhan Malik", department: "Spinning", factory: "textile", time: "08:01", direction: "in" },
  { id: "c4", employeeId: "RD-1045", name: "Nadia Rehman", department: "Dyeing", factory: "dyeing", time: "08:03", direction: "in" },
  { id: "c5", employeeId: "RD-2012", name: "Hina Zafar", department: "Quality", factory: "textile", time: "08:06", direction: "in" },
  { id: "c6", employeeId: "RD-1043", name: "Sana Yusuf", department: "Quality", factory: "dyeing", time: "08:11", direction: "in" },
  { id: "c7", employeeId: "RD-2014", name: "Rabia Noor", department: "Dyeing", factory: "textile", time: "08:14", direction: "in" },
  { id: "c8", employeeId: "RD-2013", name: "Kamran Iqbal", department: "Packaging", factory: "textile", time: "08:22", direction: "in" },
];

export const DEPARTMENT_ATTENDANCE: Record<FactoryId, { department: Department; present: number; total: number }[]> = {
  dyeing: [
    { department: "Spinning", present: 112, total: 128 },
    { department: "Dyeing", present: 96, total: 104 },
    { department: "Quality", present: 38, total: 48 },
    { department: "Packaging", present: 54, total: 72 },
  ],
  textile: [
    { department: "Spinning", present: 88, total: 96 },
    { department: "Dyeing", present: 61, total: 80 },
    { department: "Quality", present: 33, total: 36 },
    { department: "Packaging", present: 47, total: 56 },
  ],
};

export const PAYROLL_SUMMARY: Record<FactoryId, { gross: number; statutory: number; tax: number; budget: number }> = {
  dyeing: { gross: 18_420_000, statutory: 1_290_000, tax: 1_842_000, budget: 21_000_000 },
  textile: { gross: 14_960_000, statutory: 1_047_000, tax: 1_496_000, budget: 17_500_000 },
};

export const MODULES = [
  "Attendance",
  "Payroll Run",
  "Payslips",
  "Shift Rules",
  "Biometric Devices",
  "User Management",
] as const;

export type ModuleName = (typeof MODULES)[number];

export const DEFAULT_PERMISSIONS: Record<Exclude<Role, "CEO">, Record<ModuleName, boolean>> = {
  CFO: { Attendance: true, "Payroll Run": true, Payslips: true, "Shift Rules": false, "Biometric Devices": false, "User Management": false },
  COO: { Attendance: true, "Payroll Run": false, Payslips: true, "Shift Rules": true, "Biometric Devices": true, "User Management": false },
  Admin: { Attendance: true, "Payroll Run": false, Payslips: true, "Shift Rules": true, "Biometric Devices": true, "User Management": true },
  Manager: { Attendance: true, "Payroll Run": false, Payslips: false, "Shift Rules": false, "Biometric Devices": false, "User Management": false },
  Employee: { Attendance: false, "Payroll Run": false, Payslips: true, "Shift Rules": false, "Biometric Devices": false, "User Management": false },
};

export function formatPKR(value: number) {
  return "₨ " + value.toLocaleString("en-PK", { maximumFractionDigits: 0 });
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");
}
