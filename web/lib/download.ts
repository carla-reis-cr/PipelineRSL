/** Utilitários do navegador para baixar arquivos gerados na página. */

export function download(name: string, data: string | Blob, type = "text/plain") {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function csvRow(a: unknown[]): string {
  return a.map((v) => { const s = String(v ?? ""); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(",");
}

/** CSV com BOM, para o Excel abrir os acentos corretamente. */
export const downloadCSV = (name: string, lines: string[]) => download(name, "﻿" + lines.join("\n"), "text/csv");
