/**
 * Hands the learner a file. The only browser-side side effect the export
 * features need, kept in one place so every download is named the same way.
 */
export function downloadText(filename: string, text: string, mime = "text/plain"): void {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick: some browsers start the download asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * CSV cell, with formula injection neutralised — PRD SEC9. A cell a
 * spreadsheet would evaluate (=, +, -, @, tab, CR) is prefixed with a quote.
 */
export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csv(rows: Array<Array<string | number | null | undefined>>): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}
