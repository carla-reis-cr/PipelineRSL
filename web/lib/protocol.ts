import type { Field, Protocol, SearchBlock } from "./types";
import { SOURCE_LABELS } from "./types";

export function intOr(v: unknown): number | null {
  const n = parseInt(String(v ?? "").trim(), 10);
  return Number.isFinite(n) ? n : null;
}

export function termsOf(block: SearchBlock | undefined): string[] {
  return (block?.terms ?? "")
    .split(/\n|;/)
    .map((s) => s.trim().replace(/^"+|"+$/g, "").trim())
    .filter(Boolean);
}

export const quote = (t: string) => `"${String(t).replace(/"/g, "")}"`;

export function blocksOf(p: Protocol): string[][] {
  return (p.blocks ?? []).map(termsOf).filter((b) => b.length > 0);
}

export function fieldList(p: Protocol): Field[] {
  const f = p.fields ?? {};
  const l = (["title", "abstract", "keywords"] as Field[]).filter((k) => f[k] !== false);
  return l.length ? l : ["title", "abstract", "keywords"];
}

export function fieldsLabel(p: Protocol): string {
  const n: Record<Field, string> = { title: "Título", abstract: "Resumo", keywords: "Palavras-chave" };
  const l = fieldList(p).map((k) => n[k]);
  return l.length > 1 ? l.slice(0, -1).join(", ") + " e " + l[l.length - 1] : l[0];
}

export function languages(p: Protocol): string[] {
  return (p.langs ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

export function docTypeList(p: Protocol): ("journal" | "conference")[] {
  const d = p.docTypes ?? {};
  return (["journal", "conference"] as const).filter((k) => d[k]);
}

/* ---------- strings para colar no site de cada base ---------- */

export interface BuiltString { id: string; label: string; role: string; auto: string; s: string; custom: boolean; notes: string[] }

type Builder = (B: string[][], fs: Field[], p: Protocol) => { s: string; notes: string[] };

const BUILDERS: Record<string, Builder> = {
  scopus(B, fs, p) {
    return { s: scopusQuery(p, B, fs, true), notes: ["Cole em Advanced document search."] };
  },
  web_of_science(B, fs, p) {
    const tag: Record<Field, string> = { title: "TI", abstract: "AB", keywords: "AK" };
    const or = (b: string[]) => "(" + b.map(quote).join(" OR ") + ")";
    let s = fs.length === 3
      ? "TS=(" + B.map(or).join(" AND ") + ")"
      : B.map((b) => "(" + fs.map((f) => tag[f] + "=" + or(b)).join(" OR ") + ")").join(" AND ");
    const yf = intOr(p.yearFrom), yt = intOr(p.yearTo);
    if (yf || yt) s += ` AND PY=(${yf ?? 1900}-${yt ?? new Date().getFullYear()})`;
    const dt = docTypeList(p).map((d) => ({ journal: '"Article"', conference: '"Proceedings Paper"' })[d]);
    if (dt.length) s += " AND DT=(" + dt.join(" OR ") + ")";
    const langs = languages(p);
    if (langs.length) s += " AND LA=(" + langs.map(quote).join(" OR ") + ")";
    return { s, notes: ["Cole em Advanced Search › Query Builder."] };
  },
  ieee_xplore(B, fs) {
    const s = ieeeQuery(B, fs, "fields");
    const n = B.reduce((a, b) => a + b.length, 0) * fs.length;
    const w = B.flat().filter((t) => t.includes("*")).length * fs.length;
    const notes = ["Cole em Advanced Search › Command Search. Ano e tipo ficam nos filtros da página de resultados."];
    if (n > 25 || w > 8) notes.push(`Esta string tem ${n} termos${w ? ` e ${w} curingas` : ""}. O IEEE Xplore limita termos e curingas por busca; se for recusada, divida em uma busca por campo.`);
    return { s, notes };
  },
  acm_dl(B, fs, p) {
    const nm: Record<Field, string> = { title: "Title", abstract: "Abstract", keywords: "Keywords" };
    const s = B.map((b) => "[" + b.flatMap((t) => fs.map((f) => `[${nm[f]}: ${quote(t)}]`)).join(" OR ") + "]").join(" AND ");
    const notes = ["Cole em Advanced Search › Edit Query."];
    const yf = intOr(p.yearFrom), yt = intOr(p.yearTo);
    const filt: string[] = [];
    if (yf || yt) filt.push(`Publication Date ${yf ?? "…"}–${yt ?? "atual"}`);
    if (docTypeList(p).length) filt.push("Content Type: Research Article");
    if (filt.length) notes.push("Filtros no painel lateral: " + filt.join("; ") + ".");
    return { s, notes };
  },
  eric(B, fs) {
    const tag: Record<Field, string> = { title: "TI", abstract: "AB", keywords: "KW" };
    const s = B.map((b) => "(" + fs.map((f) => `${tag[f]} (${b.map(quote).join(" OR ")})`).join(" OR ") + ")").join(" AND ");
    return { s, notes: ["Sintaxe do EBSCOhost. No eric.ed.gov use a string genérica."] };
  },
};

export function genericString(B: string[][]): string {
  return B.map((b) => "( " + b.map(quote).join(" OR ") + " )").join(" AND ");
}

/** `withGeneric` acrescenta a string conceitual (sem sintaxe de base), exibida na aba Protocolo. */
export function buildStrings(p: Protocol, withGeneric = false): BuiltString[] {
  const B = blocksOf(p);
  if (!B.length) return [];
  const fs = fieldList(p);
  const out: BuiltString[] = [];
  const seen = new Set<string>();
  for (const src of p.sources ?? []) {
    if (!src.id || seen.has(src.id)) continue;
    seen.add(src.id);
    const b = BUILDERS[src.id];
    const r = b ? b(B, fs, p) : { s: genericString(B), notes: ["Sintaxe genérica: adapte aos campos da base."] };
    const custom = (src.custom ?? "").trim();
    out.push({ id: src.id, label: SOURCE_LABELS[src.id as keyof typeof SOURCE_LABELS] ?? src.id, role: src.role ?? "main", auto: r.s, s: custom || r.s, custom: !!custom, notes: r.notes });
  }
  if (withGeneric) out.push({ id: "generic", label: "Genérica", role: "ref", auto: genericString(B), s: genericString(B), custom: false, notes: ["Estrutura conceitual, igual à tabela do documento."] });
  return out;
}

/* ---------- queries das APIs ---------- */

/**
 * Query da Scopus Search API. Com `withFilters`, inclui anos, tipos e idioma
 * como no site; a API aceita a mesma sintaxe (DOCTYPE/LANGUAGE em vez de LIMIT-TO).
 */
export function scopusQuery(p: Protocol, B = blocksOf(p), fs = fieldList(p), siteSyntax = false): string {
  const combo = ({
    "title,abstract,keywords": "TITLE-ABS-KEY",
    "title,abstract": "TITLE-ABS",
    title: "TITLE",
    abstract: "ABS",
    keywords: "KEY",
  } as Record<string, string>)[fs.join(",")];
  const one: Record<Field, string> = { title: "TITLE", abstract: "ABS", keywords: "KEY" };
  const or = (b: string[]) => "( " + b.map(quote).join(" OR ") + " )";
  let s = combo
    ? `${combo}( ${B.map(or).join(" AND ")} )`
    : B.map((b) => "( " + fs.map((f) => one[f] + or(b)).join(" OR ") + " )").join(" AND ");
  const yf = intOr(p.yearFrom), yt = intOr(p.yearTo);
  if (yf) s += ` AND PUBYEAR > ${yf - 1}`;
  if (yt) s += ` AND PUBYEAR < ${yt + 1}`;
  const dts = docTypeList(p);
  if (dts.length) {
    const code = { journal: "ar", conference: "cp" };
    s += siteSyntax
      ? " AND ( " + dts.map((d) => `LIMIT-TO( DOCTYPE , "${code[d]}" )`).join(" OR ") + " )"
      : " AND ( " + dts.map((d) => `DOCTYPE(${code[d]})`).join(" OR ") + " )";
  }
  const langs = languages(p);
  if (langs.length) {
    s += siteSyntax
      ? " AND ( " + langs.map((l) => `LIMIT-TO( LANGUAGE , ${quote(l)} )`).join(" OR ") + " )"
      : " AND ( " + langs.map((l) => `LANGUAGE(${l.toLowerCase()})`).join(" OR ") + " )";
  }
  return s;
}

/**
 * querytext da IEEE Xplore API.
 * "metadata": termos em todos os metadados (mais amplo; respeita o limite de termos da API).
 * "fields": cada termo qualificado por "Document Title", "Abstract" e "Author Keywords".
 */
export function ieeeQuery(B: string[][], fs: Field[], mode: "metadata" | "fields" = "metadata"): string {
  if (mode === "fields") {
    const nm: Record<Field, string> = { title: '"Document Title"', abstract: '"Abstract"', keywords: '"Author Keywords"' };
    return B.map((b) => "(" + b.flatMap((t) => fs.map((f) => `${nm[f]}:${quote(t)}`)).join(" OR ") + ")").join(" AND ");
  }
  return B.map((b) => "(" + b.map(quote).join(" OR ") + ")").join(" AND ");
}
