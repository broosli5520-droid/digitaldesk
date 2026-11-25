export type Role = "owner" | "admin" | "accountant" | "teacher";
export type Kind = "school" | "tuition" | "academy" | "madrasa" | "college";

export interface Institute {
  id: string; name: string; slug: string; kind: Kind; tagline: string; phone: string; email: string; address: string; city: string;
  principal_name: string; session_label: string; currency: string; fee_due_day: number; late_fee: number; bank_details: string;
  admissions_open: boolean; admission_note: string; portal_enabled: boolean; grading: { min: number; grade: string }[];
  plan_id: string; plan_expires_at: string | null; created_at: string;
}
export interface Membership { role: Role; institute: Institute }
export interface ClassRow { id: string; institute_id: string; name: string; section: string; monthly_fee: number; timing: string; sort: number; active: boolean }
export interface Subject { id: string; class_id: string; name: string; max_marks: number; sort: number }
export interface Student {
  id: string; institute_id: string; admission_no: number; roll_no: string; name: string; father_name: string; gender: "" | "male" | "female";
  dob: string | null; phone: string; phone2: string; address: string; class_id: string | null; admission_date: string;
  monthly_fee: number | null; discount: number; family_code: string; status: "active" | "left" | "graduated"; left_on: string | null;
  notes: string; portal_pin: string; created_at: string;
}
export interface AdmissionRequest {
  id: string; student_name: string; father_name: string; phone: string; class_wanted: string; dob: string | null; gender: string;
  address: string; previous_school: string; message: string; status: "new" | "contacted" | "accepted" | "rejected"; student_id: string | null; created_at: string;
}
export type AttStatus = "P" | "A" | "L" | "V";
export interface FeeItem { label: string; amount: number }
export interface Invoice {
  id: string; student_id: string; invoice_no: number; month: string | null; items: FeeItem[]; amount: number; discount: number; fine: number;
  paid: number; status: "unpaid" | "partial" | "paid" | "waived"; due_date: string; note: string; created_at: string;
}
export interface Payment { id: string; invoice_id: string; student_id: string; receipt_no: number; amount: number; method: string; reference: string; paid_on: string; created_at: string }
export interface Exam { id: string; class_id: string; name: string; exam_date: string | null; published: boolean; created_at: string }
export interface Mark { exam_id: string; student_id: string; subject_id: string; obtained: number | null; absent: boolean }
export interface Staff { id: string; name: string; designation: string; phone: string; monthly_salary: number; joined_on: string | null; active: boolean }
export interface SalaryPayment { id: string; staff_id: string; month: string; amount: number; deduction: number; paid_on: string; note: string }
export interface Expense { id: string; category: string; amount: number; spent_on: string; note: string }
export interface Notice { id: string; title: string; body: string; class_id: string | null; created_at: string }
export interface Plan { id: string; name: string; price_monthly: number; max_students: number | null; max_staff_users: number | null; features: string[]; sort: number }

export const invoiceTotal = (i: Pick<Invoice, "amount" | "discount" | "fine">) => Math.max(Number(i.amount) - Number(i.discount), 0) + Number(i.fine);
export const invoiceDue = (i: Pick<Invoice, "amount" | "discount" | "fine" | "paid" | "status">) => (i.status === "waived" ? 0 : Math.max(invoiceTotal(i) - Number(i.paid), 0));
export const className = (c?: Pick<ClassRow, "name" | "section"> | null) => (c ? `${c.name}${c.section ? " " + c.section : ""}` : "—");
