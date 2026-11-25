import type { Role } from "./types";
type Area = "students" | "admissions" | "classes" | "attendance" | "fees" | "exams" | "staff" | "salaries" | "expenses" | "notices" | "team" | "settings" | "billing" | "reports";
const ALL: Role[] = ["owner", "admin", "accountant", "teacher"];
const MANAGE: Role[] = ["owner", "admin"];
const MONEY: Role[] = ["owner", "admin", "accountant"];
const VIEW: Record<Area, Role[]> = {
  students: ALL, admissions: MANAGE, classes: ALL, attendance: ["owner", "admin", "teacher"], fees: MONEY, exams: ["owner", "admin", "teacher"],
  staff: MONEY, salaries: MONEY, expenses: MONEY, notices: ALL, team: MANAGE, settings: MANAGE, billing: MANAGE, reports: MONEY,
};
const EDIT: Record<Area, Role[]> = { ...VIEW, students: MANAGE, classes: MANAGE, staff: MANAGE, notices: MANAGE };
export const canView = (role: Role, a: Area) => VIEW[a].includes(role);
export const canEdit = (role: Role, a: Area) => EDIT[a].includes(role);
export const roleLabel: Record<Role, string> = { owner: "Owner", admin: "Admin", accountant: "Accountant", teacher: "Teacher" };
