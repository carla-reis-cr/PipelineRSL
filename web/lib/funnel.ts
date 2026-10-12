/**
 * Pré-triagem objetiva: remoção de duplicatas e filtros automáticos
 * (tipo de documento, títulos de errata/editorial, ano, idioma, artigo curto).
 * Aparecem no fluxograma PRISMA como "duplicados" e "marcados como
 * inelegíveis por ferramentas automáticas".
 */
import { intOr } from "./protocol";
import type { KeyedRecord, Protocol } from "./types";

export const DEFAULT_EXCLUDED_TYPES =
  "book, proceedings, techreport, inbook, incollection, book chapter, editorial, editorial material, erratum, correction, letter, note, conference review, book review, meeting abstract, retracted, retraction";

export const SUSPECT_TITLE = /^(erratum|corrigendum|retraction|editorial\b|book review|front matter|back matter|table of contents|preface\b|foreword\b|author index|subject index|issue information|index$)/i;

export function normDoi(d?: string): string {
  if (!d) return "";
  let s = String(d).trim().toLowerCase();
  for (const p of ["https://doi.org/", "http://doi.org/", "https://dx.doi.org/", "http://dx.doi.org/", "doi:"]) if (s.startsWith(p)) s = s.slice(p.length);
  return s.replace(/^\/+|\/+$/g, "").trim();
}

export function normTitle(t?: string): string {
  if (!t) return "";
  return String(t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function langOk(lg: string | undefined, langs: string[]): boolean {
  if (!lg) return true;
  const L = lg.toLowerCase();
  return langs.some((a) => {
    a = a.toLowerCase();
    if (L.includes(a)) return true;
    return ["english", "inglês", "ingles"].includes(a) && /^(en|eng)\b/.test(L);
  });
}

export interface FunnelResult<R extends KeyedRecord = KeyedRecord> {
  /** chave do registro duplicado -> chave do registro mantido */
  dupOf: Record<string, string>;
  /** chave -> motivo do filtro automático */
  auto: Record<string, string>;
  /** registros que seguem para a triagem */
  screen: R[];
}

export function computeFunnel<R extends KeyedRecord>(records: R[], p: Protocol): FunnelResult<R> {
  const typesEx = new Set((p.excludedTypes ?? DEFAULT_EXCLUDED_TYPES).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
  const yf = intOr(p.yearFrom), yt = intOr(p.yearTo), short = intOr(p.shortPages) || 0;
  const langs = (p.langs || "English").split(",").map((s) => s.trim()).filter(Boolean);

  // registros com resumo têm preferência ao escolher qual duplicata manter
  const order = records.map((r, i) => ({ r, i })).sort((a, b) => (b.r.abstract ? 1 : 0) - (a.r.abstract ? 1 : 0) || a.i - b.i);
  const seenDoi = new Map<string, string>(), seenTitle = new Map<string, string>();
  const dupOf: Record<string, string> = {};
  for (const { r } of order) {
    const d = normDoi(r.doi), t = normTitle(r.title);
    const hit = (d && seenDoi.get(d)) || (t && seenTitle.get(t));
    if (hit) { dupOf[r.key] = hit; continue; }
    if (d) seenDoi.set(d, r.key);
    if (t) seenTitle.set(t, r.key);
  }

  const auto: Record<string, string> = {};
  for (const r of records) {
    if (dupOf[r.key]) continue;
    const ty = (r.docType || "").toLowerCase().trim();
    if (ty && typesEx.has(ty)) { auto[r.key] = "Tipo de documento: " + r.docType; continue; }
    if (p.suspectTitles !== false && SUSPECT_TITLE.test((r.title || "").trim())) { auto[r.key] = "Título de errata/editorial/índice"; continue; }
    if (r.year && ((yf && r.year < yf) || (yt && r.year > yt))) { auto[r.key] = "Fora da janela de anos"; continue; }
    if (p.langFilter !== false && !langOk(r.language, langs)) { auto[r.key] = "Idioma: " + r.language; continue; }
    if (short && r.pages && r.pages <= short) { auto[r.key] = `Artigo curto (≤ ${short} páginas)`; continue; }
  }
  return { dupOf, auto, screen: records.filter((r) => !dupOf[r.key] && !auto[r.key]) };
}
