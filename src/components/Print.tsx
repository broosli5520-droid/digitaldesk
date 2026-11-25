import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { Printer, X } from "lucide-react";

/**
 * Full-screen print preview. Only the sheet is printed (see .print-root in index.css).
 * Works on phones too: the browser's print dialog can "Save as PDF" and share on WhatsApp.
 */
export function PrintPreview({ title, onClose, children, landscape }: { title: string; onClose: () => void; children: ReactNode; landscape?: boolean }) {
  return createPortal(
    <div className="print-root fixed inset-0 z-[80] overflow-auto bg-slate-200">
      <style>{`@page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 8mm; }`}</style>
      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-2 bg-slate-900 px-4 py-3 text-white">
        <div className="truncate font-medium">{title}</div>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500"><Printer className="h-4 w-4" />Print / Save PDF</button>
          <button onClick={onClose} className="rounded-lg bg-white/10 p-2 hover:bg-white/20" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
      </div>
      <div className="mx-auto my-6 w-full max-w-[210mm] bg-white p-[6mm] text-black shadow-xl print:my-0 print:max-w-none print:p-0 print:shadow-none">{children}</div>
    </div>,
    document.body,
  );
}

/** Institute letterhead used on challans, receipts, report cards and ID cards. */
export function Letterhead({ name, tagline, address, phone, small }: { name: string; tagline?: string; address?: string; phone?: string; small?: boolean }) {
  return (
    <div className="text-center">
      <div className={small ? "text-base font-bold" : "text-xl font-bold"}>{name}</div>
      {tagline && <div className="text-[11px] text-slate-600">{tagline}</div>}
      {(address || phone) && <div className="text-[11px] text-slate-600">{[address, phone && `Ph: ${phone}`].filter(Boolean).join(" · ")}</div>}
    </div>
  );
}
