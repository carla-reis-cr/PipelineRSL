import type { DocType, Field, Protocol, SearchBlock } from "./types";
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

/**
 * Um termo pode ser uma frase ("supply chain": palavras juntas) ou um grupo com AND
 * ("machine AND learning": palavras em qualquer posição). Só o AND em maiúsculas conta.
 */
export const splitAnd = (t: string): string[] => String(t).split(/\s+AND\s+/).map((s) => s.trim()).filter(Boolean);

export function quote(t: string): string {
  const q = (s: string) => `"${s.replace(/"/g, "")}"`;
  const parts = splitAnd(t);
  return parts.length > 1 ? "(" + parts.map(q).join(" AND ") + ")" : q(String(t));
}

export function blocksOf(p: Protocol): string[][] {
  return (p.blocks ?? []).map(termsOf).filter((b) => b.length > 0);
}

/** Campos de busca. Os três primeiros valem por padrão; os demais só entram se marcados. */
export const ALL_FIELDS: Field[] = ["title", "abstract", "keywords", "authors", "venue"];
export const CORE_FIELDS: Field[] = ["title", "abstract", "keywords"];
export const FIELD_PT: Record<Field, string> = { title: "Título", abstract: "Resumo", keywords: "Palavras-chave", authors: "Autores", venue: "Fonte (periódico ou evento)" };
export const FIELD_EN: Record<Field, string> = { title: "Title", abstract: "Abstract", keywords: "Keywords", authors: "Authors", venue: "Source title" };

/** Tipos de documento e como cada base os chama (scopus: DOCTYPE; wos: DT; ieee: content_type). */
export const DOC_TYPES: Record<DocType, { label: string; scopus: string; wos: string; ieee: string; match: string[] }> = {
  journal: { label: "Artigos de periódico", scopus: "ar", wos: "Article", ieee: "Journals", match: ["article", "journal"] },
  conference: { label: "Artigos de conferência", scopus: "cp", wos: "Proceedings Paper", ieee: "Conferences", match: ["conference", "inproceedings", "proceedings paper"] },
  review: { label: "Artigos de revisão", scopus: "re", wos: "Review", ieee: "Journals", match: ["review"] },
  book_chapter: { label: "Capítulos de livro", scopus: "ch", wos: "Book Chapter", ieee: "Books", match: ["chapter", "incollection"] },
  book: { label: "Livros", scopus: "bk", wos: "Book", ieee: "Books", match: ["book"] },
};

export function fieldList(p: Protocol): Field[] {
  const f = p.fields ?? {};
  const l = ALL_FIELDS.filter((k) => (CORE_FIELDS.includes(k) ? f[k] !== false : f[k] === true));
  return l.length ? l : CORE_FIELDS;
}

export function fieldsLabel(p: Protocol): string {
  const l = fieldList(p).map((k) => FIELD_PT[k]);
  return l.length > 1 ? l.slice(0, -1).join(", ") + " e " + l[l.length - 1] : l[0];
}

export function languages(p: Protocol): string[] {
  return (p.langs ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

export function docTypeList(p: Protocol): DocType[] {
  const d = p.docTypes ?? {};
  return (Object.keys(DOC_TYPES) as DocType[]).filter((k) => d[k]);
}

/* ---------- strings para colar no site de cada base ---------- */

export interface BuiltString { id: string; label: string; role: string; auto: string; s: string; custom: boolean; notes: string[] }

type Builder = (B: string[][], fs: Field[], p: Protocol) => { s: string; notes: string[] };

const BUILDERS: Record<string, Builder> = {
  scopus(B, fs, p) {
    return { s: scopusQuery(p, B, fs, true), notes: ["Cole em Advanced document search."] };
  },
  web_of_science(B, fs, p) {
    const tag: Record<Field, string> = { title: "TI", abstract: "AB", keywords: "AK", authors: "AU", venue: "SO" };
    const or = (b: string[]) => "(" + b.map(quote).join(" OR ") + ")";
    let s = fs.length === 3 && CORE_FIELDS.every((f) => fs.includes(f))
      ? "TS=(" + B.map(or).join(" AND ") + ")"
      : B.map((b) => "(" + fs.map((f) => tag[f] + "=" + or(b)).join(" OR ") + ")").join(" AND ");
    const yf = intOr(p.yearFrom), yt = intOr(p.yearTo);
    if (yf || yt) s += ` AND PY=(${yf ?? 1900}-${yt ?? new Date().getFullYear()})`;
    const dt = [...new Set(docTypeList(p).map((d) => `"${DOC_TYPES[d].wos}"`))];
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
    const nm: Record<Field, string> = { title: "Title", abstract: "Abstract", keywords: "Keywords", authors: "Author", venue: "Publication Title" };
    const s = B.map((b) => "[" + b.flatMap((t) => fs.map((f) => `[${nm[f]}: ${quote(t)}]`)).join(" OR ") + "]").join(" AND ");
    const notes = ["Cole em Advanced Search › Edit Query."];
    const yf = intOr(p.yearFrom), yt = intOr(p.yearTo);
    const filt: string[] = [];
    if (yf || yt) filt.push(`Publication Date ${yf ?? "…"}–${yt ?? "atual"}`);
    if (docTypeList(p).length) filt.push("Content Type: " + docTypeList(p).map((d) => DOC_TYPES[d].label.toLowerCase()).join(", "));
    if (filt.length) notes.push("Filtros no painel lateral: " + filt.join("; ") + ".");
    return { s, notes };
  },
  eric(B, fs) {
    const tag: Record<Field, string> = { title: "TI", abstract: "AB", keywords: "KW", authors: "AU", venue: "SO" };
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
  const one: Record<Field, string> = { title: "TITLE", abstract: "ABS", keywords: "KEY", authors: "AUTH", venue: "SRCTITLE" };
  const or = (b: string[]) => "( " + b.map(quote).join(" OR ") + " )";
  let s = combo
    ? `${combo}( ${B.map(or).join(" AND ")} )`
    : B.map((b) => "( " + fs.map((f) => one[f] + or(b)).join(" OR ") + " )").join(" AND ");
  const yf = intOr(p.yearFrom), yt = intOr(p.yearTo);
  if (yf) s += ` AND PUBYEAR > ${yf - 1}`;
  if (yt) s += ` AND PUBYEAR < ${yt + 1}`;
  const dts = docTypeList(p);
  if (dts.length) {
    s += siteSyntax
      ? " AND ( " + dts.map((d) => `LIMIT-TO( DOCTYPE , "${DOC_TYPES[d].scopus}" )`).join(" OR ") + " )"
      : " AND ( " + dts.map((d) => `DOCTYPE(${DOC_TYPES[d].scopus})`).join(" OR ") + " )";
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
    const nm: Record<Field, string> = { title: '"Document Title"', abstract: '"Abstract"', keywords: '"Author Keywords"', authors: '"Authors"', venue: '"Publication Title"' };
    return B.map((b) => "(" + b.flatMap((t) => fs.map((f) => `${nm[f]}:${quote(t)}`)).join(" OR ") + ")").join(" AND ");
  }
  return B.map((b) => "(" + b.map(quote).join(" OR ") + ")").join(" AND ");
}
