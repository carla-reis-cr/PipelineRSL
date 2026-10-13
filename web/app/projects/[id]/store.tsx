"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fromRow } from "@/lib/db";
import { migrateProtocol } from "@/lib/defaults";
import { deriveFunnel, deriveScreening, type AiLogEntry, type AiSuggestion, type ConsMap, type Funnel, type Screening, type Stage, type Vote, type VoteDecision, type VoteMap } from "@/lib/screening";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { KeyedRecord, Protocol } from "@/lib/types";

export interface Member { user_id: string; email: string; role: "owner" | "reviewer" | "viewer"; slot: number | null }
export interface ImportRow { id: string; source: string; method: string; file_name: string | null; query: string | null; total_reported: number | null; record_count: number; status: string; error: string | null; created_at: string }
/** Por questão: categorias aceitas (a), recusadas (x) e evidência (n). Na chave "_qa": respostas de qualidade (v). */
export interface SqData { a?: string[]; x?: string[]; n?: string; v?: Record<string, "y" | "p" | "n"> }
/** Extração de um estudo: uma entrada por questão secundária. */
export interface ExEntry { data: Record<string, SqData>; done: boolean; by?: string }

type Rows<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
type Result = PromiseLike<{ error: { message: string } | null }>;

/** Lê todas as linhas de uma consulta, de 1.000 em 1.000 (limite padrão do Supabase). */
async function fetchAll<T>(page: (from: number, to: number) => Rows<T>, onProgress?: (n: number) => void): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    onProgress?.(out.length);
    if (!data || data.length < 1000) break;
  }
  return out;
}

const toVote = (row: any): Vote => ({ d: row.decision, ...(row.reason ? { r: row.reason } : {}), ...(row.criteria && Object.keys(row.criteria).length ? { cr: row.criteria } : {}), ...(row.bulk ? { bulk: true } : {}) });
const toLog = (row: any): AiLogEntry => ({ id: row.id, date: String(row.created_at).slice(0, 10), stage: row.stage, tool: row.tool, what: row.what, check: row.verification ?? "", auto: !!row.auto });
const toAi = (row: any): AiSuggestion => ({ d: row.decision, c: row.criterion ?? "", r: row.reason ?? "" });

export function getPath(o: any, path: string): any { return path.split(".").reduce((a, k) => (a == null ? a : a[k]), o); }
export function setPath(o: any, path: string, v: unknown) {
  const ks = path.split(".");
  let a = o;
  for (let i = 0; i < ks.length - 1; i++) { const k = ks[i]; if (a[k] == null) a[k] = /^\d+$/.test(ks[i + 1]) ? [] : {}; a = a[k]; }
  a[ks[ks.length - 1]] = v;
}

export interface Bancada {
  projectId: string; me: string; aiEnabled: boolean;
  protocol: Protocol; updateProtocol: (mut: (p: Protocol) => void) => void;
  save: { cls: "ok" | "busy" | "err"; txt: string };
  loading: string | null;
  imports: ImportRow[]; reloadRecords: () => Promise<void>; removeImport: (id: string) => Promise<void>;
  F: Funnel; S: Screening;
  team: Member[]; r1: string | null; r2: string | null; mode: 1 | 2; myRole: "r1" | "r2" | null; canWrite: boolean; isOwner: boolean;
  nameOf: (id: string | null | undefined) => string;
  joinSlot: (slot: 1 | 2) => Promise<void>; leaveSlot: (userId: string) => Promise<void>; addMember: (email: string) => Promise<string | null>;
  votes: VoteMap; cons: ConsMap; castVotes: (stage: Stage, entries: [string, Vote][]) => Promise<void>;
  setConsensus: (stage: Stage, key: string, d: VoteDecision | "", r?: string) => Promise<void>;
  ex: Record<string, ExEntry>; saveEx: (key: string, mut: (e: ExEntry) => void) => void;
  ai: Record<string, AiSuggestion>; aiIds: Set<string>; reloadAi: () => Promise<void>;
  aiLog: AiLogEntry[]; addLog: (e: Omit<AiLogEntry, "id" | "date">) => Promise<void>; removeLog: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
  toast: (msg: string) => void;
}

const Ctx = createContext<Bancada | null>(null);
export function useB(): Bancada {
  const b = useContext(Ctx);
  if (!b) throw new Error("useB fora de BancadaProvider");
  return b;
}

export function BancadaProvider({ projectId, me, aiEnabled, initialProtocol, initialImports, children }: { projectId: string; me: string; aiEnabled: boolean; initialProtocol: Protocol; initialImports: ImportRow[]; children: ReactNode }) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastT = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toast = useCallback((msg: string) => { setToastMsg(msg); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToastMsg(null), 3600); }, []);

  /* ---------- gravação ---------- */
  const [save, setSave] = useState<Bancada["save"]>({ cls: "ok", txt: "Tudo salvo" });
  const pending = useRef(0);
  const track = useCallback(async <R extends { error: { message: string } | null }>(op: PromiseLike<R>): Promise<R> => {
    pending.current++;
    setSave({ cls: "busy", txt: "Salvando…" });
    const res = await op;
    pending.current--;
    if (res.error) { setSave({ cls: "err", txt: "Erro ao salvar" }); toast("Não foi possível salvar: " + res.error.message); }
    else if (!pending.current) setSave({ cls: "ok", txt: "Tudo salvo" });
    return res;
  }, [toast]);

  /* ---------- protocolo ---------- */
  const [protocol, setProtocol] = useState(() => migrateProtocol(initialProtocol));
  const protoRef = useRef(protocol);
  const protoT = useRef<ReturnType<typeof setTimeout>>(undefined);
  const updateProtocol = useCallback((mut: (p: Protocol) => void) => {
    const next = structuredClone(protoRef.current);
    mut(next);
    next.updatedAt = new Date().toISOString();
    protoRef.current = next;
    setProtocol(next);
    setSave({ cls: "busy", txt: "Editando…" });
    clearTimeout(protoT.current);
    protoT.current = setTimeout(() => { track(sb.from("projects").update({ protocol: protoRef.current, title: protoRef.current.title ?? "" }).eq("id", projectId) as Result); }, 600);
  }, [sb, projectId, track]);

  // O funil e a pré-avaliação só são refeitos quando muda algo que os afeta, e com atraso,
  // para não recalcular milhares de registros a cada tecla.
  const deriveKey = useMemo(() => JSON.stringify([protocol.excludedTypes, protocol.suspectTitles, protocol.yearFrom, protocol.yearTo, protocol.langs, protocol.langFilter, protocol.shortPages, protocol.blocks, [...(protocol.ic || []), ...(protocol.ec || [])].map((c) => [c.c, c.rule])]), [protocol]);
  const [funnelProto, setFunnelProto] = useState(protocol);
  useEffect(() => { const t = setTimeout(() => setFunnelProto(protoRef.current), 400); return () => clearTimeout(t); }, [deriveKey]);

  /* ---------- dados ---------- */
  const [loading, setLoading] = useState<string | null>("Carregando…");
  const [records, setRecords] = useState<KeyedRecord[]>([]);
  const [imports, setImports] = useState(initialImports);
  const [team, setTeam] = useState<Member[]>([]);
  const [votes, setVotes] = useState<VoteMap>({ ta: {}, ft: {} });
  const [cons, setCons] = useState<ConsMap>({ ta: {}, ft: {} });
  const [ex, setEx] = useState<Record<string, ExEntry>>({});
  const exRef = useRef(ex);
  const exT = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [ai, setAi] = useState<Record<string, AiSuggestion>>({});
  const [aiIds, setAiIds] = useState<Set<string>>(new Set());
  const [aiLog, setAiLog] = useState<AiLogEntry[]>([]);

  const loadTeam = useCallback(async () => {
    const { data } = await sb.rpc("project_team", { p: projectId });
    if (data) setTeam(data as Member[]);
  }, [sb, projectId]);

  const reloadRecords = useCallback(async () => {
    const imp = await sb.from("imports").select("id,source,method,file_name,query,total_reported,record_count,status,error,created_at").eq("project_id", projectId).order("created_at");
    if (imp.data) setImports(imp.data as ImportRow[]);
    const rows = await fetchAll<any>((a, b) => sb.from("records").select("*").eq("project_id", projectId).order("created_at").order("id").range(a, b), (n) => setLoading(`Carregando registros… ${n.toLocaleString("pt-BR")}`));
    setRecords(rows.map(fromRow));
    setLoading(null);
  }, [sb, projectId]);

  const loadVotes = useCallback(async () => {
    const rows = await fetchAll<any>((a, b) => sb.from("votes").select("record_id,stage,reviewer_id,decision,reason,criteria,bulk").eq("project_id", projectId).order("record_id").order("reviewer_id").order("stage").range(a, b));
    const next: VoteMap = { ta: {}, ft: {} };
    for (const r of rows) ((next[r.stage as Stage][r.reviewer_id] ??= {})[r.record_id] = toVote(r));
    setVotes(next);
  }, [sb, projectId]);

  const reloadAi = useCallback(async () => {
    const [ids, rows] = await Promise.all([
      fetchAll<{ record_id: string }>((a, b) => sb.rpc("ai_suggested_ids", { p: projectId }).order("record_id").range(a, b)),
      fetchAll<any>((a, b) => sb.from("ai_suggestions").select("record_id,decision,criterion,reason").eq("project_id", projectId).order("record_id").range(a, b)),
    ]);
    setAiIds(new Set(ids.map((r) => r.record_id)));
    setAi(Object.fromEntries(rows.map((r) => [r.record_id, toAi(r)])));
  }, [sb, projectId]);

  const loadRest = useCallback(async () => {
    const [c, e, l] = await Promise.all([
      fetchAll<any>((a, b) => sb.from("consensus").select("record_id,stage,decision,reason").eq("project_id", projectId).order("record_id").order("stage").range(a, b)),
      fetchAll<any>((a, b) => sb.from("extractions").select("record_id,data,done,updated_by").eq("project_id", projectId).order("record_id").range(a, b)),
      fetchAll<any>((a, b) => sb.from("ai_log").select("*").eq("project_id", projectId).order("created_at").range(a, b)),
    ]);
    const nc: ConsMap = { ta: {}, ft: {} };
    for (const r of c) nc[r.stage as Stage][r.record_id] = { d: r.decision, ...(r.reason ? { r: r.reason } : {}) };
    setCons(nc);
    exRef.current = Object.fromEntries(e.map((r) => [r.record_id, { data: r.data ?? {}, done: !!r.done, by: r.updated_by }]));
    setEx(exRef.current);
    setAiLog(l.map(toLog));
  }, [sb, projectId]);

  const refresh = useCallback(async () => {
    try { await Promise.all([loadTeam(), loadVotes(), loadRest(), reloadAi()]); }
    catch (e) { toast("Não foi possível atualizar: " + (e instanceof Error ? e.message : String(e))); }
  }, [loadTeam, loadVotes, loadRest, reloadAi, toast]);

  useEffect(() => {
    (async () => {
      try { await Promise.all([reloadRecords(), refresh()]); }
      catch (e) { setLoading(null); toast("Não foi possível carregar o projeto: " + (e instanceof Error ? e.message : String(e))); }
    })();
  }, [reloadRecords, refresh, toast]);

  /* ---------- equipe ---------- */
  const mine = team.find((m) => m.user_id === me);
  const canWrite = !!mine && mine.role !== "viewer";
  const isOwner = mine?.role === "owner";
  const mode: 1 | 2 = Number(protocol.reviewers) === 1 ? 1 : 2;
  const r1 = team.find((m) => m.slot === 1)?.user_id ?? null;
  const r2 = team.find((m) => m.slot === 2)?.user_id ?? null;
  const myRole = r1 === me ? "r1" : mode === 2 && r2 === me ? "r2" : null;
  const nameOf = useCallback((id: string | null | undefined) => {
    if (!id) return "";
    const name = team.find((m) => m.user_id === id)?.email.split("@")[0] || "Revisor";
    return id === me ? `${name} (você)` : name;
  }, [team, me]);

  const joinSlot = useCallback(async (slot: 1 | 2) => {
    const { error } = await track(sb.rpc("set_my_slot", { p: projectId, new_slot: slot }));
    if (!error) await Promise.all([loadTeam(), loadVotes()]);
  }, [sb, projectId, track, loadTeam, loadVotes]);
  const leaveSlot = useCallback(async (userId: string) => {
    const op = userId === me ? sb.rpc("set_my_slot", { p: projectId, new_slot: null }) : sb.from("project_members").update({ slot: null }).eq("project_id", projectId).eq("user_id", userId);
    const { error } = await track(op as Result);
    if (!error) await loadTeam();
  }, [sb, projectId, me, track, loadTeam]);
  const addMember = useCallback(async (email: string) => {
    const { error } = await sb.rpc("add_member", { p: projectId, member_email: email });
    if (error) return error.message;
    await loadTeam();
    return null;
  }, [sb, projectId, loadTeam]);

  /* ---------- derivação ---------- */
  const F = useMemo(() => deriveFunnel(records, funnelProto), [records, funnelProto]);
  const S = useMemo(() => deriveScreening(F, { votes, cons, mode, revIds: (mode === 1 ? [r1] : [r1, r2]).filter(Boolean) as string[] }), [F, votes, cons, mode, r1, r2]);

  /* ---------- decisões ---------- */
  const castVotes = useCallback(async (stage: Stage, entries: [string, Vote][]) => {
    if (!entries.length) return;
    setVotes((v) => ({ ...v, [stage]: { ...v[stage], [me]: { ...v[stage][me], ...Object.fromEntries(entries) } } }));
    const rows = entries.map(([k, v]) => ({ record_id: k, stage, reviewer_id: me, project_id: projectId, decision: v.d, reason: v.r ?? null, criteria: v.cr ?? {}, bulk: !!v.bulk }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await track(sb.from("votes").upsert(rows.slice(i, i + 500), { onConflict: "record_id,stage,reviewer_id" }) as Result);
      if (error) { await loadVotes(); return; }
    }
    // Com a triagem cega, o voto do outro revisor e a sugestão da IA só ficam visíveis depois do meu voto.
    if (entries.length > 1) { await Promise.all([loadVotes(), stage === "ta" ? reloadAi() : null]); return; }
    const k = entries[0][0];
    const [others, sug] = await Promise.all([
      sb.from("votes").select("record_id,stage,reviewer_id,decision,reason,criteria,bulk").eq("record_id", k).eq("stage", stage),
      stage === "ta" ? sb.from("ai_suggestions").select("record_id,decision,criterion,reason").eq("record_id", k).maybeSingle() : null,
    ]);
    if (others.data) setVotes((v) => {
      const st = { ...v[stage] };
      for (const r of others.data) if (r.reviewer_id !== me) st[r.reviewer_id] = { ...st[r.reviewer_id], [k]: toVote(r) };
      return { ...v, [stage]: st };
    });
    if (sug?.data) setAi((a) => ({ ...a, [k]: toAi(sug.data) }));
  }, [sb, projectId, me, track, loadVotes, reloadAi]);

  const setConsensus = useCallback(async (stage: Stage, key: string, d: VoteDecision | "", r?: string) => {
    setCons((c) => {
      const st = { ...c[stage] };
      if (d) st[key] = d === "exc" || d === "nr" ? { d, r } : { d }; else delete st[key];
      return { ...c, [stage]: st };
    });
    if (d) await track(sb.from("consensus").upsert({ record_id: key, stage, project_id: projectId, decision: d, reason: d === "exc" || d === "nr" ? r || null : null, decided_by: me }, { onConflict: "record_id,stage" }) as Result);
    else await track(sb.from("consensus").delete().eq("record_id", key).eq("stage", stage) as Result);
  }, [sb, projectId, me, track]);

  const saveEx = useCallback((key: string, mut: (e: ExEntry) => void) => {
    const cur = structuredClone(exRef.current[key] ?? { data: {}, done: false });
    mut(cur);
    cur.by = me;
    exRef.current = { ...exRef.current, [key]: cur };
    setEx(exRef.current);
    setSave({ cls: "busy", txt: "Editando…" });
    clearTimeout(exT.current[key]);
    exT.current[key] = setTimeout(() => {
      const e = exRef.current[key];
      track(sb.from("extractions").upsert({ record_id: key, project_id: projectId, data: e.data, done: e.done, updated_by: me }, { onConflict: "record_id" }) as Result);
    }, 500);
  }, [sb, projectId, me, track]);

  const removeImport = useCallback(async (id: string) => {
    const { error } = await track(sb.from("imports").delete().eq("id", id) as Result);
    if (error) return;
    toast("Importação removida. As decisões já feitas nesses registros deixam de contar.");
    await Promise.all([reloadRecords(), refresh()]);
  }, [sb, track, toast, reloadRecords, refresh]);

  const addLog = useCallback(async (e: Omit<AiLogEntry, "id" | "date">) => {
    const { data, error } = await track(sb.from("ai_log").insert({ project_id: projectId, stage: e.stage, tool: e.tool, what: e.what, verification: e.check || null, auto: !!e.auto }).select("*").single());
    if (!error && data) setAiLog((l) => [...l, toLog(data)]);
  }, [sb, projectId, track]);
  const removeLog = useCallback(async (id: string) => {
    setAiLog((l) => l.filter((x) => x.id !== id));
    await track(sb.from("ai_log").delete().eq("id", id) as Result);
  }, [sb, track]);

  const value: Bancada = {
    projectId, me, aiEnabled, protocol, updateProtocol, save, loading, imports, reloadRecords, removeImport, F, S,
    team, r1, r2, mode, myRole, canWrite, isOwner, nameOf, joinSlot, leaveSlot, addMember,
    votes, cons, castVotes, setConsensus, ex, saveEx, ai, aiIds, reloadAi, aiLog, addLog, removeLog, refresh, toast,
  };
  return (
    <Ctx.Provider value={value}>
      {children}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </Ctx.Provider>
  );
}
