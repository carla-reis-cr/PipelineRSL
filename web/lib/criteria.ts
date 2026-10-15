/**
 * Pré-avaliação dos critérios de elegibilidade e sugestão de categorias da extração.
 * Nada aqui decide: os resultados são exibidos ao revisor, que aceita ou corrige.
 *
 * Valores: "y" = atende (IC) ou se aplica (EC); "n" = não atende / não se aplica;
 * "u" = indeterminado (falta dado).
 */
import { langOk } from "./funnel";
import { ALL_FIELDS, CORE_FIELDS, DOC_TYPES, docTypeList, intOr, splitAnd, termsOf } from "./protocol";
import type { BibRecord, Criterion, CriterionRule, Field, Protocol } from "./types";

export type CritValue = "y" | "n" | "u";
export interface CritEval { v: CritValue; ev: string }

export const RULE_LABELS: Record<string, string> = {
  none: "Manual", year: "Ano dentro da janela", lang: "Idioma aceito", doctype: "Tipo de documento aceito",
  block: "Termos de um bloco da string", string: "Todos os blocos da string", terms: "Lista de termos",
};
export const FIELD_NAMES: Record<Field, string> = { title: "título", abstract: "resumo", keywords: "palavras-chave", authors: "autores", venue: "fonte" };

/** Quem procura termos num texto: `exec` devolve a posição e o trecho que casou. */
export interface TermMatcher { exec(text: string): { index: number; 1: string } | null }

const termSource = (t: string) => t.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[\\w-]*").replace(/\s+/g, "[\\s-]+");
const wordRe = (src: string) => new RegExp("(?<![\\w])(" + src + ")(?![\\w])", "i");

/** Termos simples casam sozinhos; um termo "a AND b" só casa se todas as partes aparecem no mesmo texto. */
export function termRegex(terms: string[]): TermMatcher | null {
  const long = (t: string) => t.replace(/\*/g, "").length > 1;
  const plain: string[] = [];
  const groups: RegExp[][] = [];
  for (const raw of terms) {
    const parts = splitAnd(String(raw).trim().replace(/^"+|"+$/g, "")).map((s) => s.replace(/^"+|"+$/g, "").trim());
    if (!parts.length || !parts.every(long)) continue;
    if (parts.length === 1) plain.push(parts[0]);
    else groups.push(parts.map((s) => wordRe(termSource(s))));
  }
  const simple = plain.length ? wordRe(plain.sort((a, b) => b.length - a.length).map(termSource).join("|")) : null;
  if (!simple && !groups.length) return null;
  return {
    exec(text) {
      const m = simple?.exec(text);
      if (m) return { index: m.index, 1: m[1] };
      for (const g of groups) {
        const hits = g.map((re) => re.exec(text));
        if (hits.every(Boolean)) return { index: Math.min(...hits.map((h) => h!.index)), 1: hits.map((h) => h![1]).join(" + ") };
      }
      return null;
    },
  };
}

const fieldText = (r: BibRecord, f: Field) => ({ title: r.title, abstract: r.abstract, keywords: r.keywords, authors: r.authors, venue: r.venue })[f] || "";

function snippet(text: string, idx: number, len: number) {
  const a = Math.max(0, idx - 50), b = Math.min(text.length, idx + len + 50);
  return (a ? "…" : "") + text.slice(a, b).replace(/\s+/g, " ") + (b < text.length ? "…" : "");
}

export function findIn(r: BibRecord, re: TermMatcher, fields: Field[]) {
  for (const f of fields) {
    const tx = fieldText(r, f);
    const m = re.exec(tx);
    if (m) return { field: f, term: m[1], snip: snippet(tx, m.index, m[1].length) };
  }
  return null;
}

export function ruleFields(rule: CriterionRule): Field[] {
  const f = rule.fields ?? { title: true, abstract: true, keywords: true };
  const l = ALL_FIELDS.filter((k) => f[k]);
  return l.length ? l : CORE_FIELDS;
}

export function evalRule(rule: CriterionRule | undefined, r: BibRecord, p: Protocol, kind: "ic" | "ec"): CritEval | null {
  if (!rule || !rule.type || rule.type === "none") return null;
  const objective = ["year", "lang", "doctype"].includes(rule.type);
  const flip = (cond: boolean | null, ev: string): CritEval => {
    if (cond === null) return { v: "u", ev };
    if (kind === "ic") return { v: cond ? "y" : "n", ev };
    return { v: objective ? (cond ? "n" : "y") : cond ? "y" : "n", ev };
  };
  if (rule.type === "year") {
    if (!r.year) return flip(null, "ano não informado");
    const yf = intOr(p.yearFrom), yt = intOr(p.yearTo);
    return flip(!((yf && r.year < yf) || (yt && r.year > yt)), "ano " + r.year);
  }
  if (rule.type === "lang") {
    if (!r.language) return flip(null, "idioma não informado pela base");
    const langs = (rule.values || p.langs || "English").split(",").map((s) => s.trim()).filter(Boolean);
    return flip(langOk(r.language, langs), "idioma: " + r.language);
  }
  if (rule.type === "doctype") {
    if (!r.docType) return flip(null, "tipo não informado pela base");
    const ok = (rule.values || [...new Set(docTypeList(p).flatMap((d) => DOC_TYPES[d].match))].join(", ") || "article, journal, conference, inproceedings, proceedings paper").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    return flip(ok.some((o) => r.docType!.toLowerCase().includes(o)), "tipo: " + r.docType);
  }
  let groups: string[][] = [];
  if (rule.type === "terms") groups = [(rule.terms || "").split(/\n|;/).map((s) => s.trim()).filter(Boolean)];
  if (rule.type === "block") { const b = (p.blocks || [])[Number(rule.block) || 0]; groups = b ? [termsOf(b)] : []; }
  if (rule.type === "string") groups = (p.blocks || []).map(termsOf);
  groups = groups.filter((g) => g.length);
  if (!groups.length) return null;
  const fs = ruleFields(rule);
  const hits: { field: Field; term: string; snip: string }[] = [];
  for (const g of groups) {
    const re = termRegex(g);
    const h = re && findIn(r, re, fs);
    if (!h) {
      const missingAbs = fs.includes("abstract") && !r.abstract;
      return flip(missingAbs ? null : false, missingAbs ? "nenhum termo no título; registro sem resumo" : "nenhum termo encontrado em " + fs.map((f) => FIELD_NAMES[f]).join(", "));
    }
    hits.push(h);
  }
  return flip(true, hits.map((h) => `“${h.term}” no ${FIELD_NAMES[h.field]}: ${h.snip}`).join(" | "));
}

export function evalCriteria(r: BibRecord, p: Protocol): Record<string, CritEval> {
  const out: Record<string, CritEval> = {};
  for (const kind of ["ic", "ec"] as const)
    for (const c of (p[kind] || []) as Criterion[]) {
      if (!c.c) continue;
      const e = evalRule(c.rule, r, p, kind);
      if (e) out[c.c] = e;
    }
  return out;
}

export type Decision = "inc" | "may" | "exc";

/** Decisão sugerida a partir das respostas do revisor por critério. */
export function suggestDecision(ans: Record<string, CritValue | undefined>, p: Protocol): { d: Decision | null; r?: string; why: string } {
  const ic = (p.ic || []).filter((c) => c.c), ec = (p.ec || []).filter((c) => c.c);
  const failIC = ic.find((c) => ans[c.c] === "n");
  if (failIC) return { d: "exc", r: failIC.c, why: "não atende " + failIC.c };
  const hitEC = ec.find((c) => ans[c.c] === "y");
  if (hitEC) return { d: "exc", r: hitEC.c, why: hitEC.c + " se aplica" };
  const all = [...ic, ...ec];
  const missing = all.filter((c) => !ans[c.c]).length;
  if (missing) return { d: null, why: `responda ${missing} critério${missing > 1 ? "s" : ""}` };
  if (ic.every((c) => ans[c.c] === "y") && ec.every((c) => ans[c.c] === "n")) return { d: "inc", why: "atende a todos os IC e a nenhum EC" };
  return { d: "may", why: "há critérios incertos" };
}

/* ---------- livro de códigos da extração ---------- */
export function parseCodes(text?: string): { cat: string; terms: string[] }[] {
  return String(text || "").split(/\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const i = l.indexOf(":");
    return i > 0 ? { cat: l.slice(0, i).trim(), terms: l.slice(i + 1).split(/[;,]/).map((s) => s.trim()).filter(Boolean) } : { cat: l, terms: [l] };
  });
}

export function suggestCodes(r: BibRecord, codesText?: string) {
  const out: { cat: string; term: string; field: Field; snip: string }[] = [];
  for (const c of parseCodes(codesText)) {
    const re = termRegex(c.terms);
    if (!re) continue;
    const h = findIn(r, re, ["title", "abstract", "keywords"]);
    if (h) out.push({ cat: c.cat, ...h });
  }
  return out;
}
