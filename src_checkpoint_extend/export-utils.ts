/* CSV and PDF export utilities for monthly sales data */

export function downloadCSV(filename: string, rows: { date: string; book: string; amount: number; status: string }[]) {
  const header = "Date,Book,Amount,Status\n";
  const body = rows.map(r => `${r.date},"${r.book.replace(/"/g, '""')}",${r.amount.toFixed(2)},${r.status}`).join("\n");
  const csv = header + body;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadPDFFromText(filename: string, title: string, lines: string[]) {
  // Minimal PDF generator — avoids external dependencies
  const escapePdf = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const lineObjs = lines.map((line, i) => `BT /F1 11 Tf 50 ${750 - i * 16} Td (${escapePdf(line)}) Tj ET`).join("\n");
  const titleObj = `BT /F1 16 Tf 50 780 Td (${escapePdf(title)}) Tj ET`;
  const content = `${titleObj}\n${lineObjs}`;
  const pdf = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n4 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000210 00000 n \n0000000${(210 + content.length).toString().padStart(7, "0")} 00000 n \ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${210 + content.length + 70}\n%%EOF`;
  const blob = new Blob([pdf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString("en", { month: "long", year: "numeric" });
}

export function getMonthSales(sales: any[], year: number, month: number) {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 1);
  return sales.filter((s: any) => {
    const sd = new Date(s.sale_date);
    return sd >= start && sd < end;
  });
}

export function monthTotal(sales: any[]): number {
  return sales.reduce((sum, s) => sum + Number(s.amount) || 0, 0);
}

export function buildSalesRows(monthSales: any[], books: any[]) {
  return monthSales.map(s => {
    const b = books.find((x: any) => x.id === s.book_id);
    return {
      date: new Date(s.sale_date).toLocaleDateString(),
      book: b?.title || "Unknown",
      amount: Number(s.amount) || 0,
      status: s.refunded ? "Refunded" : "Completed",
    };
  });
}
