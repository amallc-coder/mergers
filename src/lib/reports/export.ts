/** Render a ReportDoc to a real file in each format, applying the org brand
 *  standards (navy #002855, cyan #29ABE2, Calibri, confidential footer + page
 *  numbers). Each generator lazy-imports its (heavy) library so the main bundle
 *  stays small. */

import { BRAND, type ReportDoc, type ReportFormat } from "./types";

const NAVY: [number, number, number] = [0, 40, 85];
const CYAN: [number, number, number] = [41, 171, 226];
const GRAY: [number, number, number] = [90, 101, 115];
const INK: [number, number, number] = [31, 41, 51];

function slug(d: ReportDoc): string {
  const base = `${d.title} ${d.subtitle ?? ""}`.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return base || "report";
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ── PDF (jsPDF + autotable) ────────────────────────────────────────────────
async function toPdf(d: ReportDoc): Promise<Blob> {
  const { default: JsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new JsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const margin = 48;

  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 64, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(d.title, margin, 34);
  if (d.subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(d.subtitle, margin, 52);
  }
  doc.setDrawColor(...CYAN);
  doc.setLineWidth(2);
  doc.line(0, 64, W, 64);

  let y = 88;
  if (d.meta?.length) {
    doc.setTextColor(...GRAY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const metaStr = d.meta.map((m) => `${m.label}: ${m.value}`).join("    |    ");
    const lines = doc.splitTextToSize(metaStr, W - margin * 2) as string[];
    doc.text(lines, margin, y);
    y += lines.length * 12 + 8;
  }

  for (const s of d.sections) {
    if (y > H - 100) {
      doc.addPage();
      y = 64;
    }
    doc.setTextColor(...NAVY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(s.heading, margin, y);
    y += 16;
    doc.setTextColor(...GRAY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    for (const p of s.paragraphs ?? []) {
      const lines = doc.splitTextToSize(p, W - margin * 2) as string[];
      if (y + lines.length * 13 > H - 70) {
        doc.addPage();
        y = 64;
      }
      doc.text(lines, margin, y);
      y += lines.length * 13 + 6;
    }
    if (s.table) {
      autoTable(doc, {
        head: [s.table.columns],
        body: s.table.rows.map((r) => r.map((c) => String(c))),
        startY: y,
        margin: { left: margin, right: margin },
        styles: { font: "helvetica", fontSize: 9, cellPadding: 4, textColor: INK },
        headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [244, 247, 250] },
      });
      y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY ?? y) + 18;
    }
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...CYAN);
    doc.setLineWidth(0.5);
    doc.line(margin, H - 40, W - margin, H - 40);
    doc.setTextColor(150, 150, 150);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(BRAND.confidentialFooter, margin, H - 26);
    doc.text(`Page ${i} of ${pages}`, W - margin, H - 26, { align: "right" });
  }
  return doc.output("blob");
}

// ── Excel (ExcelJS) ────────────────────────────────────────────────────────
async function toExcel(d: ReportDoc): Promise<Blob> {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Report");
  const argbNavy = "FF" + BRAND.navy;
  let r = 1;

  ws.getCell(`A${r}`).value = d.title;
  ws.getCell(`A${r}`).font = { name: BRAND.font, size: 16, bold: true, color: { argb: argbNavy } };
  r++;
  if (d.subtitle) {
    ws.getCell(`A${r}`).value = d.subtitle;
    ws.getCell(`A${r}`).font = { name: BRAND.font, size: 12, color: { argb: "FF" + BRAND.grayText } };
    r++;
  }
  r++;
  for (const m of d.meta ?? []) {
    ws.getCell(`A${r}`).value = m.label;
    ws.getCell(`A${r}`).font = { name: BRAND.font, bold: true };
    ws.getCell(`B${r}`).value = m.value;
    ws.getCell(`B${r}`).font = { name: BRAND.font };
    r++;
  }
  r++;

  for (const s of d.sections) {
    ws.getCell(`A${r}`).value = s.heading;
    ws.getCell(`A${r}`).font = { name: BRAND.font, size: 12, bold: true, color: { argb: argbNavy } };
    r++;
    for (const p of s.paragraphs ?? []) {
      ws.getCell(`A${r}`).value = p;
      ws.getCell(`A${r}`).font = { name: BRAND.font };
      ws.getCell(`A${r}`).alignment = { wrapText: true };
      r++;
    }
    if (s.table) {
      const header = ws.getRow(r);
      s.table.columns.forEach((c, i) => {
        const cell = header.getCell(i + 1);
        cell.value = c;
        cell.font = { name: BRAND.font, bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argbNavy } };
      });
      r++;
      for (const row of s.table.rows) {
        const rr = ws.getRow(r);
        row.forEach((v, i) => {
          const cell = rr.getCell(i + 1);
          cell.value = v as string | number;
          cell.font = { name: BRAND.font };
        });
        r++;
      }
      r++;
    }
  }
  ws.columns.forEach((c) => {
    c.width = 30;
  });

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// ── Word (docx) ────────────────────────────────────────────────────────────
async function toWord(d: ReportDoc): Promise<Blob> {
  const docx = await import("docx");
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, Footer, PageNumber } = docx;
  const F = BRAND.font;
  const children: Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> = [];

  children.push(new Paragraph({ children: [new TextRun({ text: d.title, bold: true, size: 32, color: BRAND.navy, font: F })] }));
  if (d.subtitle) children.push(new Paragraph({ children: [new TextRun({ text: d.subtitle, size: 24, color: BRAND.grayText, font: F })] }));
  for (const m of d.meta ?? []) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${m.label}: `, bold: true, font: F, size: 18 }),
          new TextRun({ text: m.value, font: F, size: 18 }),
        ],
      }),
    );
  }
  for (const s of d.sections) {
    children.push(new Paragraph({ spacing: { before: 240, after: 80 }, children: [new TextRun({ text: s.heading, bold: true, size: 26, color: BRAND.navy, font: F })] }));
    for (const p of s.paragraphs ?? []) {
      // No bold in narrative prose, per brand standards.
      children.push(new Paragraph({ children: [new TextRun({ text: p, font: F, size: 20 })] }));
    }
    if (s.table) {
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              tableHeader: true,
              children: s.table.columns.map(
                (c) =>
                  new TableCell({
                    shading: { fill: BRAND.navy },
                    children: [new Paragraph({ children: [new TextRun({ text: c, bold: true, color: "FFFFFF", font: F, size: 18 })] })],
                  }),
              ),
            }),
            ...s.table.rows.map(
              (row) =>
                new TableRow({
                  children: row.map(
                    (v) =>
                      new TableCell({
                        children: [new Paragraph({ children: [new TextRun({ text: String(v), font: F, size: 18 })] })],
                      }),
                  ),
                }),
            ),
          ],
        }),
      );
    }
  }

  const doc = new Document({
    sections: [
      {
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: BRAND.confidentialFooter + "    ", font: F, size: 14, color: BRAND.grayText }),
                  new TextRun({ children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], font: F, size: 14, color: BRAND.grayText }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  return await Packer.toBlob(doc);
}

// ── PowerPoint (pptxgenjs) ─────────────────────────────────────────────────
async function toPptx(d: ReportDoc): Promise<void> {
  const PptxGen = (await import("pptxgenjs")).default;
  const pptx = new PptxGen();
  pptx.defineSlideMaster({
    title: "BRAND",
    background: { color: "FFFFFF" },
    slideNumber: { x: 0.3, y: "94%", color: "888888", fontFace: BRAND.font, fontSize: 8 },
  });

  const title = pptx.addSlide({ masterName: "BRAND" });
  title.background = { color: BRAND.navy };
  title.addText(d.title, { x: 0.6, y: 2.1, w: 8.8, h: 1, fontFace: BRAND.font, fontSize: 32, bold: true, color: "FFFFFF" });
  if (d.subtitle) title.addText(d.subtitle, { x: 0.6, y: 3.1, w: 8.8, fontFace: BRAND.font, fontSize: 18, color: BRAND.cyan });
  if (d.meta?.length)
    title.addText(d.meta.map((m) => `${m.label}: ${m.value}`).join("\n"), { x: 0.6, y: 3.9, w: 8.8, fontFace: BRAND.font, fontSize: 12, color: "DDDDDD" });

  for (const s of d.sections) {
    const sl = pptx.addSlide({ masterName: "BRAND" });
    sl.addText(s.heading, { x: 0.4, y: 0.3, w: 9.2, fontFace: BRAND.font, fontSize: 20, bold: true, color: BRAND.navy });
    let y = 1.1;
    if (s.paragraphs?.length) {
      sl.addText(
        s.paragraphs.map((p) => ({ text: p, options: { bullet: true } })),
        { x: 0.5, y, w: 9, h: 1.6, fontFace: BRAND.font, fontSize: 12, color: "333333" },
      );
      y += 1.7;
    }
    if (s.table) {
      const rows = [
        s.table.columns.map((c) => ({ text: c, options: { bold: true, color: "FFFFFF", fill: { color: BRAND.navy }, fontFace: BRAND.font } })),
        ...s.table.rows.map((r) => r.map((v) => ({ text: String(v), options: { fontFace: BRAND.font } }))),
      ];
      sl.addTable(rows as never, { x: 0.4, y, w: 9.2, fontSize: 9, border: { type: "solid", color: "DDDDDD", pt: 0.5 }, autoPage: true });
    }
    sl.addText(BRAND.confidentialFooter, { x: 0.3, y: "90%", w: 8.5, fontFace: BRAND.font, fontSize: 7, color: "AAAAAA" });
  }
  await pptx.writeFile({ fileName: `${slug(d)}.pptx` });
}

/** Generate + download the report in the requested format. */
export async function exportReport(d: ReportDoc, format: ReportFormat): Promise<void> {
  if (format === "pptx") {
    await toPptx(d); // self-downloads
    return;
  }
  const map = {
    pdf: { gen: toPdf, ext: "pdf" },
    excel: { gen: toExcel, ext: "xlsx" },
    word: { gen: toWord, ext: "docx" },
  } as const;
  const { gen, ext } = map[format];
  const blob = await gen(d);
  downloadBlob(blob, `${slug(d)}.${ext}`);
}
