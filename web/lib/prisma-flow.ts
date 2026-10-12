/** Fluxograma PRISMA 2020 (bases de dados e registros) em SVG. */
import type { PrismaCounts } from "./screening";
import { SOURCE_LABELS, type Protocol } from "./types";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const fmtN = (n: number) => Number(n || 0).toLocaleString("pt-BR");

/**
 * `print` embute cores e fontes no próprio SVG (para baixar e colar no artigo);
 * sem ele, o desenho usa as classes da página e acompanha o tema claro/escuro.
 */
export function flowSVG(c: PrismaCounts, p: Protocol, print = false): string {
  const col = { bg: "#FFFFFF", ink: "#13252A", line: "#9AAAAC", side: "#F3F6F6", ph: "#DCEDEE", pht: "#1C6670", mut: "#55686D" };
  const W = 820, LX = 120, LW = 330, RX = 500, RW = 300, lh = 17, pad = 12, gap = 30;
  const srcLines = Object.entries(c.bySrc).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${SOURCE_LABELS[s as keyof typeof SOURCE_LABELS] ?? s} (n = ${fmtN(n)})`);
  const reasonLines = Object.entries(c.reasons).sort((a, b) => b[1] - a[1]).map(([k, n]) => {
    const t = (p.ec || []).find((x) => x.c === k)?.t ?? ((p.ic || []).some((x) => x.c === k) ? "não atende " + k : "");
    return `${k}${t ? ": " + (t.length > 34 ? t.slice(0, 34) + "…" : t) : ""} (n = ${fmtN(n)})`;
  });
  const boxes: { ph: number; L: string[]; R: string[] | null }[] = [
    { ph: 0, L: ["Registros identificados em bases de dados (n = " + fmtN(c.total) + ")", ...srcLines.map((s) => "   " + s)], R: ["Registros removidos antes da triagem:", "   Duplicados (n = " + fmtN(c.dupN) + ")", "   Marcados como inelegíveis por", "   ferramentas automáticas (n = " + fmtN(c.autoN) + ")", "   Removidos por outros motivos (n = 0)"] },
    { ph: 1, L: ["Registros triados (n = " + fmtN(c.screened) + ")", ...(c.taPend ? ["   Ainda em triagem (n = " + fmtN(c.taPend) + ")"] : [])], R: ["Registros excluídos (n = " + fmtN(c.taExc) + ")"] },
    { ph: 1, L: ["Relatórios buscados para recuperação (n = " + fmtN(c.sought) + ")"], R: ["Relatórios não recuperados (n = " + fmtN(c.nr) + ")"] },
    { ph: 1, L: ["Relatórios avaliados para elegibilidade (n = " + fmtN(c.assessed) + ")", ...(c.ftPend ? ["   Ainda em avaliação (n = " + fmtN(c.ftPend) + ")"] : [])], R: ["Relatórios excluídos (n = " + fmtN(c.ftExcN) + "):", ...(reasonLines.length ? reasonLines.map((s) => "   " + s) : ["   —"])] },
    { ph: 2, L: ["Estudos incluídos na revisão (n = " + fmtN(c.inc) + ")"], R: null },
  ];
  const phaseFont = `font-family="Helvetica, Arial, sans-serif" font-size="11" letter-spacing="1"`;
  const txt = (x: number, y: number, s: string, bold: boolean) => `<text x="${x}" y="${y}" ${bold ? 'class="h"' : ""} ${print ? `fill="${col.ink}" font-family="Helvetica, Arial, sans-serif" font-size="12.5" ${bold ? 'font-weight="600"' : ""}` : ""} xml:space="preserve">${esc(s)}</text>`;
  const rect = (x: number, y: number, w: number, h: number, side = false) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" class="bx ${side ? "side" : ""}" ${print ? `fill="${side ? col.side : col.bg}" stroke="${col.line}"` : ""}/>`;
  const arrow = (x1: number, y1: number, x2: number, y2: number) => {
    const horiz = x2 > x1;
    return `<path d="M${x1} ${y1} L${x2} ${y2}" class="ar" ${print ? `stroke="${col.mut}" fill="none" stroke-width="1.2"` : ""}/><path d="M${x2} ${y2} l${horiz ? -7 : -4} ${horiz ? -4 : -7} l${horiz ? 0 : 8} ${horiz ? 8 : 0} z" class="arh" ${print ? `fill="${col.mut}"` : ""}/>`;
  };
  let y = 50, prevBottom: number | null = null;
  const out: string[] = [];
  const phY: number[][] = [[], [], []];
  for (const b of boxes) {
    const hL = pad * 2 + b.L.length * lh - 4, hR = b.R ? pad * 2 + b.R.length * lh - 4 : 0, h = Math.max(hL, hR);
    out.push(rect(LX, y, LW, h));
    b.L.forEach((s, j) => out.push(txt(LX + 12, y + pad + 12 + j * lh, s, j === 0)));
    if (b.R) {
      out.push(rect(RX, y, RW, h, true));
      b.R.forEach((s, j) => out.push(txt(RX + 12, y + pad + 12 + j * lh, s, j === 0)));
      out.push(arrow(LX + LW, y + h / 2, RX - 2, y + h / 2));
    }
    if (prevBottom != null) out.push(arrow(LX + LW / 2, prevBottom, LX + LW / 2, y - 2));
    phY[b.ph].push(y, y + h);
    prevBottom = y + h;
    y += h + gap;
  }
  const names = ["IDENTIFICAÇÃO", "TRIAGEM", "INCLUÍDOS"];
  const phases = phY.map((ys, i) => {
    const a = Math.min(...ys), b = Math.max(...ys), cx = 50, cy = (a + b) / 2;
    return `<rect x="30" y="${a}" width="40" height="${b - a}" rx="3" class="phase" ${print ? `fill="${col.ph}"` : ""}/><text x="${cx}" y="${cy}" transform="rotate(-90 ${cx} ${cy})" text-anchor="middle" dominant-baseline="middle" class="phase-t" ${print ? `fill="${col.pht}" ${phaseFont}` : ""}>${names[i]}</text>`;
  }).join("");
  const H = y - gap + 20;
  const head = `<rect x="${LX}" y="10" width="${RX + RW - LX}" height="26" rx="3" class="phase" ${print ? `fill="${col.ph}"` : ""}/><text x="${(LX + RX + RW) / 2}" y="27" text-anchor="middle" class="phase-t" ${print ? `fill="${col.pht}" ${phaseFont}` : ""}>IDENTIFICAÇÃO DE ESTUDOS VIA BASES DE DADOS E REGISTROS</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Fluxograma PRISMA 2020">${print ? `<rect width="${W}" height="${H}" fill="#FFFFFF"/>` : ""}${head}${phases}${out.join("")}</svg>`;
}
