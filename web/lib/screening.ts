/**
 * Estado da triagem derivado dos votos: decisão final por registro, números do
 * fluxograma PRISMA 2020, concordância entre revisores e declaração de uso de IA.
 */
import { evalCriteria, type CritEval, type CritValue } from "./criteria";
import { computeFunnel } from "./funnel";
import type { KeyedRecord, Protocol } from "./types";

export type Stage = "ta" | "ft";
export type VoteDecision = "inc" | "may" | "exc" | "nr";
export interface Vote { d: VoteDecision; r?: string; cr?: Record<string, CritValue>; bulk?: boolean }
/** etapa -> revisor -> registro -> voto */
export type VoteMap = Record<Stage, Record<string, Record<string, Vote>>>;
export type ConsMap = Record<Stage, Record<string, { d: VoteDecision; r?: string }>>;
export type StatusCode = "inc" | "exc" | "nr" | "conf" | "pend";
export interface Status { s: StatusCode; final?: VoteDecision; r?: string; by?: string }
export interface AiSuggestion { d: VoteDecision; c?: string; r?: string }
export interface AiLogEntry { id: string; date: string; stage: string; tool: string; what: string; check: string; auto?: boolean }

export interface ScreenCtx { votes: VoteMap; cons: ConsMap; mode: 1 | 2; revIds: string[] }

export const INC = (d: VoteDecision) => d === "inc" || d === "may";
const asStatus = (d: VoteDecision): StatusCode => (d === "may" ? "inc" : d);

export function statusOf(k: string, stage: Stage, ctx: ScreenCtx): Status {
  const c = ctx.cons[stage][k];
  if (c?.d) return { s: asStatus(c.d), final: c.d, by: "consenso", r: c.r };
  const ids = ctx.revIds;
  if (ctx.mode === 1) {
    const v1 = ctx.votes[stage][ids[0]]?.[k];
    return v1 ? { s: asStatus(v1.d), final: v1.d, r: v1.r } : { s: "pend" };
  }
  const v = ids.map((id) => ctx.votes[stage][id]?.[k]).filter(Boolean) as Vote[];
  if (v.length < 2) return { s: "pend" };
  const [a, b] = v;
  if (stage === "ta") {
    if (INC(a.d) && INC(b.d)) return { s: "inc", final: "inc" };
    if (a.d === "exc" && b.d === "exc") return { s: "exc", final: "exc", r: a.r || b.r };
    return { s: "conf" };
  }
  if (a.d === b.d) return { s: asStatus(a.d), final: a.d, r: a.r || b.r };
  return { s: "conf" };
}

export function kappa(pairs: [boolean, boolean][]): number | null {
  const n = pairs.length;
  if (n < 5) return null;
  let a = 0, b = 0, c = 0, d = 0;
  for (const [x, y] of pairs) { if (x && y) a++; else if (x && !y) b++; else if (!x && y) c++; else d++; }
  const po = (a + d) / n, pe = ((a + b) / n) * ((a + c) / n) + ((c + d) / n) * ((b + d) / n);
  return pe === 1 ? 1 : (po - pe) / (1 - pe);
}

/* ---------- derivação ---------- */
export interface Funnel {
  recs: KeyedRecord[];
  byK: Record<string, KeyedRecord>;
  dupOf: Record<string, string>;
  auto: Record<string, string>;
  screen: KeyedRecord[];
  /** pré-avaliação dos critérios, por registro que segue para a triagem */
  crit: Record<string, Record<string, CritEval>>;
}

export function deriveFunnel(recs: KeyedRecord[], p: Protocol): Funnel {
  const f = computeFunnel(recs, p);
  const byK: Record<string, KeyedRecord> = {};
  recs.forEach((r) => (byK[r.key] = r));
  const crit: Funnel["crit"] = {};
  f.screen.forEach((r) => (crit[r.key] = evalCriteria(r, p)));
  return { recs, byK, ...f, crit };
}

export interface Screening { ta: Record<string, Status>; ft: Record<string, Status>; ftPool: KeyedRecord[] }

export function deriveScreening(f: Funnel, ctx: ScreenCtx): Screening {
  const ta: Record<string, Status> = {}, ft: Record<string, Status> = {};
  f.screen.forEach((r) => (ta[r.key] = statusOf(r.key, "ta", ctx)));
  const ftPool = f.screen.filter((r) => ta[r.key].s === "inc");
  ftPool.forEach((r) => (ft[r.key] = statusOf(r.key, "ft", ctx)));
  return { ta, ft, ftPool };
}

export const extractPool = (s: Screening) => s.ftPool.filter((r) => s.ft[r.key].s === "inc");

/** Uma regra automática indica exclusão: IC não atendido ou EC que se aplica. */
export function autoExcludes(f: Funnel, p: Protocol, k: string, code: string): boolean {
  const e = f.crit[k]?.[code];
  if (!e) return false;
  return critKind(p, code) === "ic" ? e.v === "n" : e.v === "y";
}
export const critKind = (p: Protocol, code: string): "ic" | "ec" => ((p.ic || []).some((c) => c.c === code) ? "ic" : "ec");

/* ---------- PRISMA ---------- */
export interface PrismaCounts {
  bySrc: Record<string, number>; total: number; dupN: number; autoN: number; screened: number; taExc: number; taPend: number;
  sought: number; nr: number; assessed: number; ftExcN: number; reasons: Record<string, number>; ftPend: number; inc: number;
}

export function prismaCounts(f: Funnel, s: Screening): PrismaCounts {
  const bySrc: Record<string, number> = {};
  f.recs.forEach((r) => (bySrc[r.source] = (bySrc[r.source] || 0) + 1));
  const open = (st: Status) => st.s === "pend" || st.s === "conf";
  const ftExc = s.ftPool.filter((r) => s.ft[r.key].s === "exc");
  const reasons: Record<string, number> = {};
  ftExc.forEach((r) => { const c = s.ft[r.key].r || "Sem motivo"; reasons[c] = (reasons[c] || 0) + 1; });
  const sought = s.ftPool.length, nr = s.ftPool.filter((r) => s.ft[r.key].s === "nr").length;
  return {
    bySrc, total: f.recs.length, dupN: Object.keys(f.dupOf).length, autoN: Object.keys(f.auto).length,
    screened: f.screen.length,
    taExc: f.screen.filter((r) => s.ta[r.key].s === "exc").length,
    taPend: f.screen.filter((r) => open(s.ta[r.key])).length,
    sought, nr, assessed: sought - nr, ftExcN: ftExc.length, reasons,
    ftPend: s.ftPool.filter((r) => open(s.ft[r.key])).length,
    inc: s.ftPool.filter((r) => s.ft[r.key].s === "inc").length,
  };
}

/* ---------- concordância e uso de IA ---------- */
export interface Metrics { pairs: number; k: number | null; agree: number | null; tp: number; fn: number; fp: number; tn: number; sens: number | null; spec: number | null; aiN: number }

export function metrics(f: Funnel, s: Screening, votes: VoteMap, ai: Record<string, AiSuggestion>, r1?: string | null, r2?: string | null): Metrics {
  const pairs: [boolean, boolean][] = [];
  if (r1 && r2) f.screen.forEach((r) => { const x = votes.ta[r1]?.[r.key], y = votes.ta[r2]?.[r.key]; if (x && y) pairs.push([INC(x.d), INC(y.d)]); });
  const agree = pairs.length ? pairs.filter(([x, y]) => x === y).length / pairs.length : null;
  let tp = 0, fn = 0, fp = 0, tn = 0;
  f.screen.forEach((r) => {
    const a = ai[r.key], fin = s.ta[r.key];
    if (!a || (fin.s !== "inc" && fin.s !== "exc")) return;
    const ai1 = INC(a.d), h = fin.s === "inc";
    if (ai1 && h) tp++; else if (!ai1 && h) fn++; else if (ai1 && !h) fp++; else tn++;
  });
  return { pairs: pairs.length, k: kappa(pairs), agree, tp, fn, fp, tn, sens: tp + fn ? tp / (tp + fn) : null, spec: fp + tn ? tn / (fp + tn) : null, aiN: tp + fn + fp + tn };
}

export const pct = (v: number | null) => (v == null ? "—" : (v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%");
const fmtN = (n: number) => n.toLocaleString("pt-BR");
const lower1 = (t: string) => { t = String(t || "").trim().replace(/[.;]\s*$/, ""); return t.charAt(0).toLowerCase() + t.slice(1); };

export function buildDeclaration(log: AiLogEntry[], m: Metrics, mode: 1 | 2): string {
  if (!log.length) return "Nenhuma ferramenta de inteligência artificial generativa foi utilizada na condução desta revisão sistemática.\n\n(Quando houver usos registrados, este texto é substituído por uma declaração detalhada.)";
  let t = log.map((l) => `Na etapa de ${lower1(l.stage)}, utilizou-se ${l.tool} para ${lower1(l.what)}.` + (l.check ? ` ${l.check.trim().replace(/\.?$/, ".")}` : "")).join("\n\n");
  if (m.aiN >= 10) t += `\n\nComparadas às decisões finais dos revisores em ${fmtN(m.aiN)} registros, as sugestões da IA tiveram sensibilidade de ${pct(m.sens)} e especificidade de ${pct(m.spec)}.`;
  if (m.k != null) t += ` A concordância entre os revisores na triagem de títulos e resumos foi de ${pct(m.agree)} (kappa de Cohen = ${m.k.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}).`;
  t += `\n\nAs decisões de inclusão e exclusão foram tomadas por ${mode === 1 ? "um revisor humano" : "dois revisores humanos independentes, com divergências resolvidas por consenso"}. Os autores revisaram todo o conteúdo produzido com apoio de IA e assumem total responsabilidade pela publicação. Nenhuma ferramenta de IA foi listada como autora.`;
  return t;
}
