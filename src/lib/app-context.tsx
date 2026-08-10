import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { CURRENT_EMPLOYEE_ID, EMPLOYEES, type Department, type FactoryId, type Role } from "@/data/demo";

interface AppState {
  role: Role;
  setRole: (r: Role) => void;
  factory: FactoryId;
  setFactory: (f: FactoryId) => void;
  managedDepartment: Department;
  isExecutive: boolean;
  canSeePayroll: boolean;
  canAdmin: boolean;
  selfId: string;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>("CEO");
  const [factory, setFactory] = useState<FactoryId>("dyeing");

  const value = useMemo<AppState>(() => {
    const self = EMPLOYEES.find((e) => e.id === CURRENT_EMPLOYEE_ID)!;
    return {
      role,
      setRole,
      factory,
      setFactory,
      managedDepartment: self.department,
      isExecutive: role === "CEO" || role === "CFO" || role === "COO",
      canSeePayroll: role !== "Manager",
      canAdmin: role === "CEO" || role === "Admin",
      selfId: CURRENT_EMPLOYEE_ID,
    };
  }, [role, factory]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}

/** Rows the active role is allowed to see. */
export function useVisibleEmployees() {
  const { role, factory, managedDepartment, selfId } = useApp();
  return useMemo(() => {
    const base = EMPLOYEES.filter((e) => e.factory === factory);
    if (role === "Employee") return EMPLOYEES.filter((e) => e.id === selfId);
    if (role === "Manager") return base.filter((e) => e.department === managedDepartment);
    return base;
  }, [role, factory, managedDepartment, selfId]);
}
