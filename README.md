# DigitalDesk — School & Tuition Manager

Free-to-start management system for schools, tuition centres, academies, madrasas and colleges.
React + TypeScript + Tailwind (Vite) on Vercel, Supabase (Postgres + Auth) as the backend.

## Modules
- **Admissions** — public form `/apply/<link>`, requests inbox, admit in one click
- **Students** — profiles, siblings (family code), concessions, CSV import/export, ID cards
- **Attendance** — 30-second daily marking, WhatsApp absent alerts, monthly register (print/CSV)
- **Fees** — one-click monthly invoices, extra charges, 3-copy challans with arrears, partial payments,
  receipts, late fines, waivers, defaulters list with WhatsApp reminders, collection report
- **Exams & results** — marks grid, positions, grades, result sheet, report cards, publish to parents
- **Staff & salaries** — salary payments with deductions and slips · **Expenses** · **Reports** (income vs expense)
- **Notices** — shown in the parent portal, one-tap copy for WhatsApp groups
- **Parent portal** `/portal/<link>` — admission no. + 6-digit PIN: fees, attendance, results, notices
- **Team & roles** — owner, admin, accountant (money), teacher (attendance & marks)
- **Plans & billing** — Free (100 students) → Basic → Standard → Premium, paid by JazzCash/Easypaisa/bank and approved in **Platform admin**

## Set up
1. Create a Supabase project. In **SQL Editor** run `supabase/migrations/20261126000000_school.sql`.
2. Auth → URL configuration: Site URL = your site, Redirect URLs = `https://your-site/**`.
3. Deploy to Vercel with env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (publishable key).
4. Register on the site, then make yourself platform owner:
   `insert into public.platform_admins (user_id) select id from auth.users where email = 'you@example.com';`
5. In Platform admin, enter your JazzCash/Easypaisa/bank details so schools can pay for plans.

## Security
Every table has Row Level Security; users only see institutes they belong to, and roles limit what they can change.
Fee totals/paid amounts, plans and counters can't be edited from the browser. Public pages use rate-limited functions.
