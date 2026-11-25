import { Link } from "react-router-dom";
import { BookOpenCheck, CalendarCheck, Check, FileSpreadsheet, IdCard, Inbox, MessageCircle, Receipt, ShieldCheck, Smartphone, Users, Wallet } from "lucide-react";
import { supabase } from "../lib/supabase";
import { must, useAsync } from "../lib/useAsync";
import { money } from "../lib/format";
import { BRAND } from "../lib/brand";
import type { Plan } from "../lib/types";
import { useAuth } from "../contexts/AuthContext";
import { Logo } from "../components/Layout";

const FEATURES = [
  { icon: Inbox, title: "Online admissions", text: "Share one link on WhatsApp/Facebook. Parents fill the form, you admit with one click.", ur: "آن لائن داخلہ فارم" },
  { icon: CalendarCheck, title: "30-second attendance", text: "Everyone present by default — tap the absent ones. WhatsApp parents of absentees instantly.", ur: "حاضری" },
  { icon: Receipt, title: "Fee challans & receipts", text: "Generate the whole month's fees in one click. 3-copy challans, concessions, late fine, arrears, receipts.", ur: "فیس چالان" },
  { icon: Wallet, title: "Defaulters & reminders", text: "See who hasn't paid and send a polite WhatsApp reminder — free, no SMS cost.", ur: "نادہندگان" },
  { icon: BookOpenCheck, title: "Results & report cards", text: "Enter marks once. Positions, grades, result sheet and printable report cards — automatically.", ur: "رزلٹ کارڈ" },
  { icon: Smartphone, title: "Parent portal", text: "Parents see fees, attendance, results and notices on their phone with a 6-digit PIN.", ur: "والدین کا پورٹل" },
  { icon: Users, title: "Staff & salaries", text: "Staff list, monthly salary with deductions and printable salary slips.", ur: "تنخواہیں" },
  { icon: FileSpreadsheet, title: "Expenses & profit", text: "Record rent and bills. See income vs expenses and net profit for every month.", ur: "آمدن و خرچ" },
  { icon: IdCard, title: "ID cards & Excel", text: "Print student ID cards. Import your old Excel list and export anything to Excel.", ur: "آئی ڈی کارڈ" },
  { icon: ShieldCheck, title: "Roles & safety", text: "Separate logins for teachers and accountants. Data is protected per institute.", ur: "محفوظ" },
];

export default function Landing() {
  const { user } = useAuth();
  const plans = useAsync(async () => must(await supabase.from("plans").select("*").order("sort")) as Plan[], []);
  return (
    <div className="min-h-full bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <Logo />
        <div className="flex gap-2">{user ? <Link to="/app" className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white">Open dashboard</Link> : <>
          <Link to="/login" className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">Sign in</Link>
          <Link to="/register" className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800">Start free</Link></>}</div>
      </header>
      <section className="bg-gradient-to-br from-emerald-800 via-emerald-700 to-emerald-900 px-4 py-20 text-white">
        <div className="mx-auto max-w-4xl text-center">
          <p className="urdu text-2xl text-amber-200">{BRAND.urduTagline}</p>
          <h1 className="mt-4 text-4xl font-bold sm:text-5xl">Run your school or tuition centre from your phone</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-emerald-100">Admissions, attendance, fee challans, results, salaries and a parent portal — in Urdu-friendly, simple screens. Free for up to 100 students.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to={user ? "/app" : "/register"} className="rounded-xl bg-amber-400 px-6 py-3 font-semibold text-emerald-950 shadow-lg hover:bg-amber-300">Start free — no card needed</Link>
            <a href="#features" className="rounded-xl bg-white/10 px-6 py-3 font-semibold hover:bg-white/20">See features</a>
          </div>
          <p className="mt-4 text-sm text-emerald-200">For schools · tuition centres · academies · madrasas · colleges</p>
        </div>
      </section>
      <section id="features" className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-3xl font-bold">Everything a Pakistani school needs</h2>
        <p className="mt-2 text-center text-slate-600">No software to install. Works on any phone, tablet or computer.</p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{FEATURES.map((f) => (
          <div key={f.title} className="rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between"><div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><f.icon className="h-6 w-6" /></div><span className="urdu text-sm text-amber-700">{f.ur}</span></div>
            <h3 className="mt-3 font-semibold">{f.title}</h3><p className="mt-1 text-sm text-slate-600">{f.text}</p>
          </div>))}</div>
      </section>
      <section className="bg-amber-50 px-4 py-16">
        <div className="mx-auto max-w-4xl text-center"><h2 className="text-2xl font-bold">Free WhatsApp messages — no SMS bundle needed</h2>
          <p className="mt-2 text-slate-600">Absent alerts, fee reminders and portal PINs open in your own WhatsApp with the message ready. Just press send.</p>
          <MessageCircle className="mx-auto mt-6 h-12 w-12 text-emerald-600" /></div>
      </section>
      {!!plans.data?.length && (
        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-center text-3xl font-bold">Simple pricing</h2>
          <p className="mt-2 text-center text-slate-600">Start free. Upgrade only when you grow.</p>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">{plans.data.map((p) => (
            <div key={p.id} className={`flex flex-col rounded-2xl border p-6 ${p.id === "basic" ? "border-emerald-600 ring-1 ring-emerald-600" : "border-slate-200"}`}>
              <h3 className="font-semibold">{p.name}</h3>
              <div className="mt-2 text-3xl font-bold">{p.price_monthly ? money(p.price_monthly) : "Free"}<span className="text-sm font-normal text-slate-500">{p.price_monthly ? " / month" : ""}</span></div>
              <ul className="mt-4 flex-1 space-y-2 text-sm">{p.features.map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{f}</li>)}</ul>
              <Link to={user ? "/app" : "/register"} className="mt-6 rounded-lg bg-emerald-700 px-4 py-2 text-center text-sm font-medium text-white">{p.price_monthly ? `Get ${p.name}` : "Start free"}</Link>
            </div>))}</div>
        </section>
      )}
      <footer className="border-t py-8 text-center text-sm text-slate-500">© {new Date().getFullYear()} {BRAND.name} · Made in Pakistan 🇵🇰</footer>
    </div>
  );
}
