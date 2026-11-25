import type { Kind } from "./types";
/** Tuition centres say "batch", schools say "class". */
export function words(kind: Kind) {
  const tuition = kind === "tuition" || kind === "academy";
  return {
    klass: tuition ? "Batch" : "Class", klasses: tuition ? "Batches" : "Classes",
    kindLabel: { school: "School", tuition: "Tuition centre", academy: "Academy", madrasa: "Madrasa", college: "College" }[kind],
  };
}
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthStart = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
export const monthLabel = (iso: string | null) => { if (!iso) return "—"; const [y, m] = iso.split("-"); return `${MONTHS[Number(m) - 1]} ${y}`; };
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export function gradeFor(pct: number, grading: { min: number; grade: string }[]) {
  return [...grading].sort((a, b) => b.min - a.min).find((g) => pct >= g.min)?.grade ?? "—";
}
