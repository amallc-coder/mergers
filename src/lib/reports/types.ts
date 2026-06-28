/** Format-neutral report model. Builders produce a ReportDoc from app data;
 *  exporters render it to PDF / Excel / Word / PowerPoint with brand standards. */

export interface ReportTable {
  columns: string[];
  rows: (string | number)[][];
}

export interface ReportSection {
  heading: string;
  /** Narrative prose — rendered without bold per brand standards. */
  paragraphs?: string[];
  table?: ReportTable;
}

export interface ReportDoc {
  title: string;
  subtitle?: string;
  generatedAt: string;
  /** Key/value header facts (deal name, stage, etc.). */
  meta?: { label: string; value: string }[];
  sections: ReportSection[];
}

/** Organization brand standards applied to every generated document. */
export const BRAND = {
  navy: "002855",
  cyan: "29ABE2",
  ink: "1F2933",
  grayText: "5A6573",
  font: "Calibri",
  confidentialFooter: "CONFIDENTIAL — Prepared for internal M&A diligence. Do not distribute.",
  orgName: "American Medical Administrators",
} as const;

export type ReportFormat = "pdf" | "excel" | "word" | "pptx";
