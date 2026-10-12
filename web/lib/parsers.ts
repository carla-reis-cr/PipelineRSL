/**
 * Importação de exportações manuais: BibTeX (ACM, WoS, Wiley…), RIS (ERIC, Scopus),
 * texto do Web of Science (FN/PT…ER), CSV/TSV (Scopus, WoS, Publish or Perish e
 * o formato source_db,title,authors… do LiteraturaReviewPipeline).
 */
import { intOr } from "./protocol";
import type { BibRecord } from "./types";

export type FileFormat = "bib" | "ris" | "wos" | "csv";

export interface ParsedFile {
  format: FileFormat;
  /** base sugerida pelo nome do arquivo ou pelo conteúdo ("" = escolher manualmente) */
  guessedSource: string;
  /** true quando cada linha traz a própria base (coluna source_db) */
  hasSourceColumn: boolean;
  records: BibRecord[];
  error?: string;
}

const ACC: Record<string, string> = { '"': "̈", "'": "́", "`": "̀", "^": "̂", "~": "̃", c: "̧" };

export function delatex(s: unknown): string {
  if (s == null) return "";
  return String(s)
    .replace(/\{?\\([`'^"~=.uvHcdbtk])\s*\{?([A-Za-z])\}?\}?/g, (_m, a: string, l: string) => (l + (ACC[a] ?? "")).normalize("NFC"))
    .replace(/\\(&|%|_|\$|#)/g, "$1")
    .replace(/\\textendash|--/g, "–")
    .replace(/\\[a-zA-Z]+\{([^{}]*)\}/g, "$1")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function pagesFrom(p: unknown): number | null {
  if (!p) return null;
  const s = String(p).trim();
  if (/^\d+$/.test(s)) return null;
  const m = s.match(/(\d+)\s*[-–—]+\s*(\d+)/);
  if (m) {
    const a = +m[1], b = +m[2];
    if (b >= a && b - a < 2000) return b - a + 1;
  }
  return null;
}

/* ---------- BibTeX ---------- */
export function parseBib(text: string, source = ""): BibRecord[] {
  const out: Record<string, string>[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const at = text.indexOf("@", i);
    if (at < 0) break;
    let j = at + 1;
    while (j < n && /[A-Za-z]/.test(text[j])) j++;
    const type = text.slice(at + 1, j).toLowerCase();
    while (j < n && /\s/.test(text[j])) j++;
    if (text[j] !== "{" && text[j] !== "(") { i = j; continue; }
    const open = text[j];
    let depth = 1, k = j + 1;
    while (k < n && depth > 0) {
      const c = text[k];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      if (open === "(" && c === ")" && depth === 1) break;
      k++;
    }
    const body = text.slice(j + 1, k - (open === "{" ? 1 : 0));
    i = k + 1;
    if (["comment", "preamble", "string"].includes(type)) continue;
    const comma = body.indexOf(",");
    if (comma < 0) continue;
    const f: Record<string, string> = { _type: type };
    let p = comma + 1;
    const L = body.length;
    while (p < L) {
      while (p < L && /[\s,]/.test(body[p])) p++;
      const nm = body.slice(p).match(/^([A-Za-z][\w\-:.]*)\s*=\s*/);
      if (!nm) break;
      const name = nm[1].toLowerCase();
      p += nm[0].length;
      let val = "";
      const readPart = () => {
        if (body[p] === "{") {
          let d = 1, q = p + 1;
          while (q < L && d > 0) { if (body[q] === "{") d++; else if (body[q] === "}") d--; q++; }
          val += body.slice(p + 1, q - 1); p = q;
        } else if (body[p] === '"') {
          let d = 0, q = p + 1;
          while (q < L) { const c = body[q]; if (c === "{") d++; else if (c === "}") d--; else if (c === '"' && d === 0 && body[q - 1] !== "\\") break; q++; }
          val += body.slice(p + 1, q); p = q + 1;
        } else {
          const m = body.slice(p).match(/^[^,#}]*/)!;
          val += m[0].trim(); p += m[0].length;
        }
      };
      readPart();
      while (p < L) { const m = body.slice(p).match(/^\s*#\s*/); if (!m) break; p += m[0].length; readPart(); }
      f[name] = val;
    }
    out.push(f);
  }
  return out.map((e) => ({
    source,
    title: delatex(e.title),
    authors: delatex(e.author).replace(/\s+and\s+/g, "; "),
    year: intOr(e.year),
    venue: delatex(e.journal || e.booktitle || e.series || e.publisher || ""),
    doi: delatex(e.doi),
    abstract: delatex(e.abstract),
    url: delatex(e.url || ""),
    docType: e.type ? delatex(e.type) : e._type,
    language: delatex(e.language || ""),
    pages: intOr(e.numpages) || pagesFrom(delatex(e.pages)),
    keywords: delatex(e.keywords || e.author_keywords || ""),
    rawId: "",
  }));
}

/* ---------- RIS ---------- */
const RIS_TYPES: Record<string, string> = { JOUR: "article", CONF: "inproceedings", CPAPER: "inproceedings", BOOK: "book", CHAP: "inbook", RPRT: "techreport", THES: "thesis", GEN: "misc", EJOUR: "article", ABST: "meeting abstract", EDBOOK: "book" };

export function parseRIS(text: string, source = ""): BibRecord[] {
  type R = Record<string, string> & { AU: string[]; KW: string[] } & Record<string, any>;
  const out: R[] = [];
  let cur: R | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(/^([A-Z][A-Z0-9])\s{1,2}-\s?(.*)$/);
    if (!m) continue;
    const tag = m[1], val = m[2].trim();
    if (tag === "TY") { cur = { TY: val, AU: [], KW: [] } as unknown as R; continue; }
    if (!cur) continue;
    if (tag === "ER") { out.push(cur); cur = null; continue; }
    if (tag === "AU" || tag === "A1") cur.AU.push(val);
    else if (tag === "KW") cur.KW.push(val);
    else if (!(tag in cur)) cur[tag] = val;
    else if (tag === "AB" || tag === "N2") cur[tag] += " " + val;
  }
  if (cur) out.push(cur);
  return out.map((r) => ({
    source,
    title: r.TI || r.T1 || "",
    authors: r.AU.join("; "),
    year: intOr(String(r.PY || r.Y1 || r.DA || "").slice(0, 4)),
    venue: r.T2 || r.JO || r.JF || r.J2 || r.BT || "",
    doi: r.DO || "",
    abstract: r.AB || r.N2 || "",
    url: r.UR || "",
    docType: RIS_TYPES[r.TY] || String(r.TY || "").toLowerCase(),
    language: r.LA || "",
    pages: r.SP && r.EP && +r.EP >= +r.SP ? +r.EP - +r.SP + 1 : null,
    keywords: r.KW.join("; "),
    rawId: r.AN || r.ID || "",
  }));
}

/* ---------- Web of Science (texto) ---------- */
export function parseWoS(text: string, source = "web_of_science"): BibRecord[] {
  const out: Record<string, string>[] = [];
  let cur: Record<string, string> | null = null, last: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    if (/^ER\s*$/.test(raw)) { if (cur) out.push(cur); cur = null; last = null; continue; }
    if (/^(FN|VR|EF)\b/.test(raw)) continue;
    const m = raw.match(/^([A-Z][A-Z0-9]) (.*)$/);
    if (m) { cur ??= {}; last = m[1]; cur[last] = cur[last] ? cur[last] + "\n" + m[2] : m[2]; continue; }
    if (cur && last && /^ {3}/.test(raw)) cur[last] += "\n" + raw.trim();
  }
  if (cur) out.push(cur);
  const one = (s?: string) => (s || "").replace(/\n/g, " ");
  return out.map((r) => ({
    source,
    title: one(r.TI),
    authors: (r.AU || "").split("\n").join("; "),
    year: intOr(r.PY),
    venue: one(r.SO),
    doi: r.DI || "",
    abstract: one(r.AB),
    url: r.DI ? "https://doi.org/" + r.DI : "",
    docType: (r.DT || "").split(";")[0].trim(),
    language: r.LA || "",
    pages: intOr(r.PG) || (r.BP && r.EP && +r.EP >= +r.BP ? +r.EP - +r.BP + 1 : null),
    keywords: one(r.DE),
    rawId: r.UT || "",
  }));
}

/* ---------- CSV / TSV ---------- */
export function splitDelimited(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"' && f === "") { q = true; continue; }
    if (c === delim) { row.push(f); f = ""; continue; }
    if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; continue; }
    f += c;
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r[0] || "").trim() !== "");
}

const COLS: Record<string, string[]> = {
  title: ["title", "article title", "document title", "ti", "titulo", "título"],
  authors: ["authors", "author", "author full names", "au", "author names", "autores"],
  year: ["year", "publication year", "py", "publication_year", "ano"],
  venue: ["source title", "venue", "journal", "publication title", "so", "source", "conference", "publication", "periódico"],
  doi: ["doi", "di"],
  abstract: ["abstract", "ab", "resumo"],
  url: ["url", "link", "document link", "articleurl", "fulltexturl"],
  docType: ["document type", "doc_type", "type", "dt", "publication type", "pub_type", "content_type"],
  language: ["language of original document", "language", "la", "idioma", "lang"],
  pages: ["page count", "numpages", "pg", "num_pages"],
  pageRange: ["pages", "page range"],
  pageStart: ["page start", "start page", "bp"],
  pageEnd: ["page end", "end page", "ep"],
  source: ["source_db"],
  keywords: ["author keywords", "keywords", "de", "index keywords", "author_keywords"],
  rawId: ["eid", "ut (unique wos id)", "ut", "raw_id", "accession number"],
};

export function parseCSV(text: string, source = ""): { records: BibRecord[]; hasSourceColumn: boolean; isScopus: boolean; error?: string } {
  text = text.replace(/^﻿/, "");
  const first = text.split(/\r?\n/, 1)[0] || "";
  const cnt = (d: string) => first.split(d).length;
  const delim = cnt("\t") > cnt(",") && cnt("\t") > cnt(";") ? "\t" : cnt(";") > cnt(",") ? ";" : ",";
  const rows = splitDelimited(text, delim);
  if (rows.length < 2) return { records: [], hasSourceColumn: false, isScopus: false };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const idx: Record<string, number> = {};
  for (const [k, names] of Object.entries(COLS)) for (const nm of names) { const i = head.indexOf(nm); if (i >= 0) { idx[k] = i; break; } }
  if (idx.title == null) return { records: [], hasSourceColumn: false, isScopus: false, error: "Nenhuma coluna de título encontrada." };
  const g = (r: string[], k: string) => (idx[k] == null ? "" : (r[idx[k]] || "").trim());
  const records = rows.slice(1).map((r): BibRecord => {
    let pages = intOr(g(r, "pages")) || pagesFrom(g(r, "pageRange"));
    if (!pages) { const s = intOr(g(r, "pageStart")), e = intOr(g(r, "pageEnd")); if (s && e && e >= s) pages = e - s + 1; }
    return {
      source: g(r, "source") || source,
      title: g(r, "title"), authors: g(r, "authors"), year: intOr(g(r, "year")), venue: g(r, "venue"),
      doi: g(r, "doi"), abstract: g(r, "abstract"), url: g(r, "url"), docType: g(r, "docType"),
      language: g(r, "language"), pages, keywords: g(r, "keywords"), rawId: g(r, "rawId"),
    };
  }).filter((r) => r.title);
  return { records, hasSourceColumn: idx.source != null, isScopus: head.includes("eid") };
}

/* ---------- detecção ---------- */
export function detectFormat(name: string, text: string): FileFormat {
  const n = name.toLowerCase();
  if (n.endsWith(".bib") || /^\s*@\w+\s*[{(]/.test(text)) return "bib";
  if (n.endsWith(".ris") || /^TY {2}- /m.test(text.slice(0, 2000))) return "ris";
  if (/^﻿?FN /.test(text) || (/^PT [A-Z]\s*$/m.test(text.slice(0, 3000)) && /^ER\s*$/m.test(text))) return "wos";
  return "csv";
}

const PREFIXES: [string, string][] = [
  ["scopus", "scopus"], ["savedrecs", "web_of_science"], ["wos", "web_of_science"], ["acm", "acm_dl"], ["ieee", "ieee_xplore"],
  ["wiley", "wiley"], ["tandf", "taylor_francis"], ["taylor", "taylor_francis"], ["sciencedirect", "sciencedirect"], ["sd_", "sciencedirect"],
  ["google_scholar", "google_scholar"], ["scholar", "google_scholar"], ["springer", "springer"], ["openalex", "openalex"], ["pubmed", "pubmed"], ["eric", "eric"],
];

export function guessSource(name: string, format: FileFormat, isScopus = false): string {
  const n = name.toLowerCase();
  for (const [p, s] of PREFIXES) if (n.startsWith(p) || n.includes(p + "_") || n.includes(p + "-")) return s;
  if (format === "wos") return "web_of_science";
  if (isScopus) return "scopus";
  return "";
}

/** Lê um arquivo exportado. `source` força a base; sem ela, usa o palpite pelo nome e conteúdo. */
export function parseFile(name: string, text: string, source?: string): ParsedFile {
  const format = detectFormat(name, text);
  let records: BibRecord[] = [];
  let hasSourceColumn = false, isScopus = false, error: string | undefined;
  if (format === "bib") records = parseBib(text);
  else if (format === "ris") records = parseRIS(text);
  else if (format === "wos") records = parseWoS(text);
  else ({ records, hasSourceColumn, isScopus, error } = parseCSV(text));
  const guessedSource = guessSource(name, format, isScopus);
  const src = source || guessedSource;
  records = records
    .filter((r) => r.title && r.title.trim())
    .map((r) => ({ ...r, source: hasSourceColumn && r.source ? r.source : src || r.source || "other", abstract: (r.abstract || "").slice(0, 8000) }));
  if (!records.length && !error) error = "Nenhum registro reconhecido neste arquivo.";
  return { format, guessedSource, hasSourceColumn, records, error };
}
