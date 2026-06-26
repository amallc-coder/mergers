import { FileText, FileSpreadsheet, FileType, Presentation } from "lucide-react";
import { Card, CardHeader, PageHeader } from "@/components/ui";

const REPORTS = [
  "Executive transaction summary",
  "Diligence completion report",
  "Missing document report",
  "Pre-signing readiness report",
  "Post-signing transition report",
  "KPI dashboard report",
  "Financial diligence summary",
  "Revenue cycle diligence summary",
  "HR diligence summary",
  "Legal / compliance summary",
  "Risk report",
  "Investment committee summary",
];

const FORMATS = [
  { label: "PDF", icon: FileText },
  { label: "Excel", icon: FileSpreadsheet },
  { label: "Word", icon: FileType },
  { label: "PPTX", icon: Presentation },
];

export default function ReportsPage() {
  return (
    <>
      <PageHeader title="Reports" subtitle="Generate and export diligence reports for leadership and the investment committee" />
      <Card>
        <CardHeader title="Report catalog" subtitle="Select a report, then export to PDF, Excel, Word, or PowerPoint" />
        <div className="divide-y divide-ink-100">
          {REPORTS.map((r) => (
            <div key={r} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
              <span className="flex items-center gap-2 text-sm font-medium text-ink-800">
                <FileText size={16} className="text-ink-400" /> {r}
              </span>
              <div className="flex items-center gap-1.5">
                {FORMATS.map((f) => {
                  const Icon = f.icon;
                  return (
                    <button
                      key={f.label}
                      className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-2.5 py-1 text-xs font-medium text-ink-600 hover:bg-ink-50"
                    >
                      <Icon size={13} /> {f.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Card>
      <p className="mt-4 text-xs text-ink-400">
        Export generation is a Phase-5 capability; the report definitions and source data are already in place.
      </p>
    </>
  );
}
