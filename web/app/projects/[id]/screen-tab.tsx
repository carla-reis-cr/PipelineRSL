"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { RULE_LABELS, suggestDecision, type CritValue } from "@/lib/criteria";
import { normDoi } from "@/lib/funnel";
import { termsOf } from "@/lib/protocol";
import { autoExcludes, critKind, type Stage, type Vote, type VoteDecision } from "@/lib/screening";
import { SOURCE_LABELS, type Criterion, type KeyedRecord, type Protocol } from "@/lib/types";
import { useB } from "./store";
import Translation from "./translation";

const fmtN = (n: number) => n.toLocaleString("pt-BR");
export const srcLabel = (s: string) => SOURCE_LABELS[s as keyof typeof SOURCE_LABELS] ?? s;
const DLABEL: Record<VoteDecision, string> = { inc: "Incluir", may: "Talvez", exc: "Excluir", nr: "Não recuperado" };
const SLABEL: Record<string, string> = { inc: "Incluído", exc: "Excluído", nr: "Não recuperado", conf: "Conflito", pend: "Pendente", may: "Talvez" };
const KEYS: Record<VoteDecision, string> = { inc: "I", may: "T", exc: "E", nr: "N" };
export const Pill = ({ s }: { s: string }) => <span className={"pill " + s}>{SLABEL[s] ?? s}</span>;
const NO_VOTES: Record<string, Vote> = {};
const hasRule = (c: Criterion) => !!c.c && !!c.rule?.type && c.rule.type !== "none";

/** Marca no texto os termos de cada bloco da string, uma cor por bloco. */
export function useHighlight(p: Protocol) {
  const res = useMemo(() => (p.blocks || []).map((b) => {
    const terms = termsOf(b).filter((t) => t.replace(/\*/g, "").length > 2).sort((a, b) => b.length - a.length);
    return terms.length ? new RegExp("(?<![\\w])(" + terms.map((t) => t.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "\\w*").replace(/\s+/g, "[\\s-]+")).join("|") + ")(?![\\w])", "gi") : null;
  }), [p.blocks]);
  return (text: string | undefined): ReactNode => {
    if (!text) return text ?? "";
    let parts: { t: string; b?: number }[] = [{ t: text }];
    res.forEach((re, i) => {
      if (!re) return;
      parts = parts.flatMap((part) => {
        if (part.b != null) return [part];
        const out: { t: string; b?: number }[] = [];
        let last = 0;
        for (const m of part.t.matchAll(re)) {
          if (m.index > last) out.push({ t: part.t.slice(last, m.index) });
          out.push({ t: m[0], b: i % 4 });
          last = m.index + m[0].length;
        }
        if (last < part.t.length) out.push({ t: part.t.slice(last) });
        return out;
      });
    });
    return parts.map((x, i) => (x.b != null ? <mark key={i} className={"b" + x.b}>{x.t}</mark> : x.t));
  };
}

export default function ScreenTab({ stage }: { stage: Stage }) {
  const B = useB();
  const { protocol: p, F, S, votes, me, myRole, mode, canWrite, castVotes, toast } = B;
  const isTA = stage === "ta";
  const pool = isTA ? F.screen : S.ftPool;
  const st = isTA ? S.ta : S.ft;
  const myVotes = votes[stage][me] ?? NO_VOTES;
  const [filter, setFilter] = useState(isTA ? "mine" : "all");
  const [search, setSearch] = useState("");
  const [cur, setCur] = useState<string | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Record<string, CritValue>>>({});

  const cnt = useMemo(() => { const c: Record<string, number> = {}; pool.forEach((r) => (c[st[r.key].s] = (c[st[r.key].s] || 0) + 1)); return c; }, [pool, st]);
  const mineN = pool.filter((r) => myVotes[r.key]).length;
  const autoCrit = [...(p.ic || []), ...(p.ec || [])].filter(hasRule);
  const sug = filter.startsWith("sug:") ? filter.slice(4) : null;

  const qlist = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pool.filter((r) => {
      const s = st[r.key].s;
      if ((filter === "mine" || sug) && myVotes[r.key]) return false;
      if (sug && !autoExcludes(F, p, r.key, sug)) return false;
      if (filter === "pend" && s !== "pend") return false;
      if (filter === "conf" && s !== "conf") return false;
      if (filter === "inc" && s !== "inc") return false;
      if (filter === "exc" && s !== "exc" && s !== "nr") return false;
      return !q || `${r.title} ${r.authors ?? ""} ${r.doi ?? ""}`.toLowerCase().includes(q);
    });
  }, [pool, st, filter, sug, search, myVotes, F, p]);
  const current = qlist.find((r) => r.key === cur) ?? qlist[0] ?? null;
  const idx = current ? qlist.indexOf(current) : -1;
  const go = (dir: number) => { const n = qlist[Math.max(0, Math.min(qlist.length - 1, idx + dir))]; if (n) setCur(n.key); };
  const pick = (f: string) => { setFilter(f); setCur(null); setBulkConfirm(false); };

  const bulkRows = myRole ? autoCrit.map((c) => ({ c, n: pool.filter((r) => !myVotes[r.key] && autoExcludes(F, p, r.key, c.c)).length })).filter((x) => x.n) : [];
  async function bulkAccept(code: string) {
    const entries = qlist.map((r): [string, Vote] => [r.key, { d: "exc", r: code, cr: { [code]: F.crit[r.key][code].v }, bulk: true }]);
    pick("mine");
    await castVotes(stage, entries);
    toast(`${fmtN(entries.length)} exclusões registradas por ${code}.`);
  }

  /** Registra a decisão e avança para o próximo registro da fila. */
  function vote(r: KeyedRecord, v: Vote, keepPos = false) {
    if (!keepPos) setCur((qlist[idx + 1] ?? (filter === "mine" || sug ? qlist[idx - 1] : current))?.key ?? null);
    setDrafts(({ [r.key]: _, ...rest }) => rest);
    castVotes(stage, [[r.key, v]]);
  }

  const filters: [string, string][] = [["mine", "Pendentes para mim"], ["pend", "Sem decisão final"], ...(mode === 2 ? [["conf", "Conflitos"] as [string, string]] : []), ["inc", "Incluídos"], ["exc", "Excluídos"], ["all", "Todos"], ...autoCrit.map((c): [string, string] => ["sug:" + c.c, "Sugestão de exclusão: " + c.c])];
  const decided = pool.length ? ((pool.length - (cnt.pend || 0) - (cnt.conf || 0)) / pool.length) * 100 : 0;

  return (
    <section className="stack">
      <div className="panel">
        <header><h2>{isTA ? "Triagem de títulos e resumos" : "Elegibilidade (leitura completa)"}</h2><p>{isTA ? "Para cada critério, aceite ou corrija a pré-avaliação. A decisão sugerida sai das suas respostas; talvez segue para a próxima etapa." : "Confirme os critérios lendo o artigo completo ou, se não houver acesso, o resumo e os metadados. Cada exclusão leva o critério como motivo."}</p></header>
        <Team />
        <div className="stats">
          <span className="stat"><b>{fmtN(pool.length)}</b> registros</span>
          {myRole && <span className="stat"><b>{fmtN(mineN)}</b> decididos por você</span>}
          <span className="stat"><b>{fmtN(cnt.pend || 0)}</b> pendentes</span>
          {mode === 2 && <span className={"stat" + (cnt.conf ? " warn" : "")}><b>{fmtN(cnt.conf || 0)}</b> conflitos</span>}
          <span className="stat ok"><b>{fmtN(cnt.inc || 0)}</b> incluídos</span>
          <span className="stat stop"><b>{fmtN((cnt.exc || 0) + (cnt.nr || 0))}</b> excluídos</span>
        </div>
        <div className="bar" title="Decididos"><span style={{ width: decided + "%" }} /></div>
      </div>

      {!pool.length ? (
        <div className="empty"><b>{isTA ? "Nada para triar ainda" : "Nenhum registro chegou a esta etapa"}</b>{isTA ? "Busque por API ou importe os arquivos das bases na aba Busca e importação. Os registros aparecem aqui depois da remoção de duplicatas e dos filtros automáticos." : "Os registros incluídos (ou marcados como talvez) na triagem de títulos e resumos aparecem aqui."}</div>
      ) : (
        <>
          {bulkRows.length > 0 && (
            <div className="panel">
              <header><h2>Exclusões sugeridas pelas regras</h2><p>Registros pendentes para você em que uma regra automática indica exclusão. Revise a lista antes de aceitar em lote; cada aceite vira uma decisão sua, com o critério como motivo.</p></header>
              <div className="bulk">{bulkRows.map(({ c, n }) => (
                <div className="bulk-row" key={c.c}><span className="mono">{c.c}</span><span className="bt">{c.t || RULE_LABELS[c.rule!.type]}<small>{critKind(p, c.c) === "ic" ? "não atende" : "se aplica"} · {RULE_LABELS[c.rule!.type]}</small></span><b className="mono">{fmtN(n)}</b><button className="btn ghost small" onClick={() => pick("sug:" + c.c)}>Revisar lista</button></div>
              ))}</div>
            </div>
          )}
          <div className="panel">
            <div className="qbar">
              <select aria-label="Fila" value={filter} onChange={(e) => pick(e.target.value)}>{filters.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <input type="search" placeholder="Buscar por título, autor ou DOI" value={search} onChange={(e) => { setSearch(e.target.value); setCur(null); }} />
              <span className="note mono">{qlist.length ? `${idx + 1} / ${fmtN(qlist.length)}` : "0"}</span>
            </div>
            {sug && qlist.length > 0 && (
              <div className="callout warn row" style={{ justifyContent: "space-between" }}>
                <span>{fmtN(qlist.length)} registros nesta lista têm exclusão sugerida por <b>{sug}</b>. Passe pelos títulos antes de aceitar.</span>
                {bulkConfirm
                  ? <span className="row"><button className="btn danger small" onClick={() => bulkAccept(sug)}>Confirmar {fmtN(qlist.length)} exclusões</button><button className="link" onClick={() => setBulkConfirm(false)}>cancelar</button></span>
                  : <button className="btn small" disabled={!myRole} onClick={() => setBulkConfirm(true)}>Aceitar todas por {sug}</button>}
              </div>
            )}
            <div className="ftlay">
              <div className="qlist">
                <div className="list" role="listbox" aria-label="Registros">
                  {qlist.slice(0, 400).map((r) => (
                    <button className="li" key={r.key} aria-current={r.key === current?.key} onClick={() => setCur(r.key)}>
                      <span><span className="lt">{r.title}</span><span className="lm">{r.year ?? ""} · {srcLabel(r.source)}</span></span><Pill s={st[r.key].s} />
                    </button>
                  ))}
                </div>
                {qlist.length > 400 && <p className="note">Mostrando 400 de {fmtN(qlist.length)}. Use a busca para encontrar outros.</p>}
              </div>
              <div>
                {current
                  ? <Card key={current.key} r={current} stage={stage} answers={drafts[current.key] ?? myVotes[current.key]?.cr ?? {}} dirty={!!drafts[current.key]}
                      setAnswers={(a) => setDrafts((d) => ({ ...d, [current.key]: a }))} vote={vote} go={go} />
                  : <div className="empty"><b>{filter === "mine" ? "Você decidiu todos os registros desta fila" : "Nenhum registro neste filtro"}</b>{filter === "mine" && mode === 2 && cnt.conf ? "Há conflitos para resolver. Escolha Conflitos no filtro acima." : "Escolha outro filtro para revisar decisões."}</div>}
              </div>
            </div>
          </div>
          {isTA && <AiPanel />}
        </>
      )}
      {!canWrite && <p className="note">Você tem acesso só de leitura nesta revisão.</p>}
    </section>
  );
}

function Team() {
  const { team, r1, r2, mode, me, myRole, canWrite, isOwner, nameOf, joinSlot, leaveSlot, addMember, toast } = useB();
  const [email, setEmail] = useState("");
  const inSlot = team.some((m) => m.user_id === me && m.slot != null);
  const slot = (n: 1 | 2, id: string | null) => (
    <div className={"slot" + (id === me ? " mine" : "")}>
      <div className="who"><small>Revisor {n}</small><span>{id ? nameOf(id) : <span className="muted">Vago</span>}</span></div>
      {!id && !inSlot && canWrite ? <button className="btn small" onClick={() => joinSlot(n)}>Entrar como revisor {n}</button>
        : id === me ? <button className="link" onClick={() => leaveSlot(me)}>Sair</button>
        : id && isOwner ? <button className="link" onClick={() => leaveSlot(id)}>Liberar vaga</button> : null}
    </div>
  );
  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const err = await addMember(email.trim());
    if (err) toast(err); else { toast("Pessoa adicionada à equipe. Ela já pode entrar como revisora."); setEmail(""); }
  }
  return (
    <>
      <div className="team">{slot(1, r1)}{mode === 2 && slot(2, r2)}</div>
      {!myRole && canWrite && inSlot === false && (r1 && (mode === 1 || r2)) && <p className="note">As vagas de revisor estão ocupadas. Você pode acompanhar, mas não registrar decisões.</p>}
      {isOwner && (
        <details>
          <summary className="note">Equipe ({team.length}): {team.map((m) => m.email).join(", ")}</summary>
          <form className="row" style={{ marginTop: 8 }} onSubmit={invite}>
            <input type="email" required placeholder="E-mail de quem vai revisar" aria-label="E-mail do novo membro" value={email} onChange={(e) => setEmail(e.target.value)} style={{ maxWidth: 320 }} />
            <button className="btn ghost small" type="submit">Adicionar à equipe</button>
            <span className="note">A pessoa precisa ter entrado no site ao menos uma vez.</span>
          </form>
        </details>
      )}
    </>
  );
}

function Card({ r, stage, answers, dirty, setAnswers, vote, go }: { r: KeyedRecord; stage: Stage; answers: Record<string, CritValue>; dirty: boolean; setAnswers: (a: Record<string, CritValue>) => void; vote: (r: KeyedRecord, v: Vote, keepPos?: boolean) => void; go: (dir: number) => void }) {
  const { protocol: p, F, S, votes, cons, ai, me, r1, r2, mode, myRole, canWrite, setConsensus, toast } = useB();
  const hl = useHighlight(p);
  const isTA = stage === "ta";
  const k = r.key;
  const st = (isTA ? S.ta : S.ft)[k];
  const myV = votes[stage][me]?.[k];
  const consK = cons[stage][k];
  const auto = F.crit[k] ?? {};
  const ic = (p.ic || []).filter((c) => c.c), ec = (p.ec || []).filter((c) => c.c);
  const sug = suggestDecision(answers, p);
  const sugD = sug.d === "may" && !isTA ? null : sug.d;
  const [reasonSel, setReasonSel] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const reason = reasonSel ?? (dirty && sug.r ? sug.r : myV?.r || sug.r || "");
  const reasons = [...ec.map((c) => ({ c: c.c, t: c.t })), ...ic.map((c) => ({ c: c.c, t: "Não atende: " + c.t }))];
  const opts: VoteDecision[] = isTA ? ["inc", "may", "exc"] : ["inc", "exc", "nr"];
  const ids = (mode === 2 ? [r1, r2] : [r1]).filter(Boolean) as string[];
  const reasonRef = useRef<HTMLSelectElement>(null);

  function decide(d: VoteDecision, opt: { keepPos?: boolean; fromSug?: boolean; reason?: string } = {}) {
    if (!myRole) return;
    const rs = opt.reason ?? (opt.fromSug && sug.r ? sug.r : reason);
    if (stage === "ft" && d === "exc" && !rs) { setMsg("Escolha o motivo da exclusão."); reasonRef.current?.focus(); return; }
    vote(r, { d, ...(d === "exc" || d === "nr" ? { r: rs } : {}), ...(Object.keys(answers).length ? { cr: answers } : {}) }, opt.keepPos);
  }
  const acceptAuto = () => { const a = { ...answers }; for (const [c, e] of Object.entries(auto)) if (!a[c] && e.v !== "u") a[c] = e.v; setAnswers(a); };
  const answer = (code: string, v: CritValue) => { const a = { ...answers }; if (a[code] === v) delete a[code]; else a[code] = v; setAnswers(a); };
  function consensus(d: VoteDecision | "") {
    if (stage === "ft" && d === "exc" && !reason) { toast("Escolha o motivo da exclusão no seletor antes de registrar o consenso."); return; }
    setConsensus(stage, k, d, reason);
  }

  // atalhos de teclado, religados a cada renderização para enxergar o estado atual
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input,textarea,select") || e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      const d = opts.find((o) => KEYS[o].toLowerCase() === key);
      if (myRole && key === "a") { e.preventDefault(); acceptAuto(); }
      else if (myRole && e.key === "Enter" && !t.closest("button")) { if (sugD) { e.preventDefault(); decide(sugD, { fromSug: true }); } }
      else if (d && myRole) { e.preventDefault(); decide(d); }
      else if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const critRow = (c: Criterion, kind: "ic" | "ec") => {
    const a = auto[c.c], v = answers[c.c];
    const btn = (val: CritValue, text: string) => (
      <button className={`cbtn ${val === "u" ? "unk" : (val === "y") === (kind === "ic") ? "good" : "bad"}${a?.v === val && !v ? " hint" : ""}`} aria-pressed={v === val} disabled={!myRole} onClick={() => answer(c.c, val)}>{text}</button>
    );
    return (
      <div className={"crow" + (v ? " done" : "")} key={c.c}>
        <div className="ccode mono">{c.c}</div>
        <div className="cbody">
          <div className="ctext">{c.t}</div>
          <div className="cauto">
            {!a ? <span className="pill pend">manual</span> : a.v === "u" ? <span className="pill pend">indeterminado</span>
              : kind === "ic" ? <span className={"pill " + (a.v === "y" ? "inc" : "exc")}>{a.v === "y" ? "atende" : "não atende"}</span>
              : <span className={"pill " + (a.v === "y" ? "exc" : "inc")}>{a.v === "y" ? "se aplica" : "não se aplica"}</span>}
            {a?.ev && <span className="ev">{hl(a.ev)}</span>}
          </div>
        </div>
        <div className="cbtns" role="group" aria-label={c.c}>{btn("y", kind === "ic" ? "Atende" : "Aplica")}{btn("n", kind === "ic" ? "Não atende" : "Não aplica")}{btn("u", "?")}</div>
      </div>
    );
  };
  const aiS = isTA ? ai[k] : undefined;
  const doi = normDoi(r.doi);

  return (
    <article className="card">
      <div className="meta"><span className="src">{srcLabel(r.source)}</span>{r.year && <span className="mono">{r.year}</span>}{r.venue && <span>{r.venue}</span>}{r.docType && <span>{r.docType}</span>}{r.language && <span>{r.language}</span>}{r.pages ? <span>{r.pages} p.</span> : null}<Pill s={st.s} /></div>
      <h2 className="t">{hl(r.title)}</h2>
      {r.authors && <p className="au">{r.authors.length > 260 ? r.authors.slice(0, 260) + "…" : r.authors}</p>}
      {r.abstract ? <p className="ab">{hl(r.abstract)}</p> : <p className="ab none">Sem resumo neste registro. Use o DOI para ler o resumo na fonte.</p>}
      {r.keywords && <p className="note"><b>Palavras-chave:</b> {hl(r.keywords)}</p>}
      <Translation id={k} title={r.title} abstract={r.abstract} />
      <div className="row">
        {doi ? <a className="link" href={"https://doi.org/" + doi} target="_blank" rel="noopener noreferrer">doi.org/{doi}</a>
          : r.url && /^https?:\/\//i.test(r.url) ? <a className="link" href={r.url} target="_blank" rel="noopener noreferrer">Abrir na base</a> : null}
      </div>

      {(ic.length > 0 || ec.length > 0) && (
        <div className="crit-check">
          <div className="row" style={{ justifyContent: "space-between" }}><h3>Critérios de elegibilidade</h3>{myRole && <button className="link" onClick={acceptAuto}>Aceitar a pré-avaliação <kbd>A</kbd></button>}</div>
          {ic.length > 0 && <div className="cgroup"><span className="eyebrow">Inclusão: o estudo atende?</span>{ic.map((c) => critRow(c, "ic"))}</div>}
          {ec.length > 0 && <div className="cgroup"><span className="eyebrow">Exclusão: o critério se aplica?</span>{ec.map((c) => critRow(c, "ec"))}</div>}
        </div>
      )}

      {(ids.length > 0 || aiS) && (
        <div className="votes">
          {ids.map((id, i) => {
            const v = votes[stage][id]?.[k];
            // com a triagem cega, o banco só entrega o voto do outro revisor depois do meu
            const hidden = !v && id !== me && !!myRole && !myV && p.blind !== false;
            return (
              <div className="vote" key={id}><span className="lbl">Revisor {i + 1}{id === me ? " (você)" : ""}</span>
                {hidden ? <span className="muted">Oculto até você decidir</span> : v ? <span><Pill s={v.d} />{v.r && <> <span className="mono">{v.r}</span></>}{v.bulk && <> <span className="note">em lote</span></>}</span> : <span className="muted">Sem decisão</span>}
              </div>
            );
          })}
          {aiS && <div className="vote"><span className="lbl">Sugestão da IA</span><span><Pill s={aiS.d} />{aiS.c && <> <span className="mono">{aiS.c}</span></>}</span>{aiS.r && <span className="note">{aiS.r}</span>}</div>}
          {consK && <div className="vote"><span className="lbl">Consenso</span><span><Pill s={consK.d} />{consK.r && <> <span className="mono">{consK.r}</span></>}</span></div>}
        </div>
      )}

      {myRole ? (
        <div className="decide">
          {sugD ? <button className="btn" onClick={() => decide(sugD, { fromSug: true })}>Registrar: {DLABEL[sugD]}{sug.r ? ` (${sug.r})` : ""} <kbd>↵</kbd></button> : <span className="note">{sug.why}</span>}
          <span className="sep" />
          {opts.map((d) => <button key={d} className={"dbtn " + d} aria-pressed={myV?.d === d} onClick={() => decide(d)}>{DLABEL[d]} <kbd>{KEYS[d]}</kbd></button>)}
          <select ref={reasonRef} aria-label="Motivo da exclusão" value={reason} onChange={(e) => { setReasonSel(e.target.value); setMsg(""); if (myV) decide(myV.d, { keepPos: true, reason: e.target.value }); }}>
            <option value="">{isTA ? "Motivo (opcional)" : "Motivo da exclusão"}</option>
            {reasons.map((c) => <option key={c.c} value={c.c}>{c.c} · {c.t.length > 50 ? c.t.slice(0, 50) + "…" : c.t}</option>)}
          </select>
          <span className="note" role="status">{msg}</span>
        </div>
      ) : <div className="callout warn">{canWrite ? "Entre como revisor acima para registrar decisões." : "Você tem acesso só de leitura."}</div>}

      {canWrite && mode === 2 && (st.s === "conf" || consK) && (
        <div className="decide"><span className="note">Decisão de consenso:</span>
          {opts.filter((d) => d !== "may").map((d) => <button key={d} className="btn ghost small" onClick={() => consensus(d)}>{DLABEL[d]}</button>)}
          {consK && <button className="link" onClick={() => consensus("")}>desfazer consenso</button>}
        </div>
      )}
      <div className="nav"><button className="btn ghost small" onClick={() => go(-1)}>← Anterior</button><span className="kbdhint">A aceitar pré-avaliação · ↵ registrar sugerida · {opts.map((d) => KEYS[d] + " " + DLABEL[d].toLowerCase()).join(" · ")} · ← →</span><button className="btn ghost small" onClick={() => go(1)}>Próximo →</button></div>
    </article>
  );
}

function AiPanel() {
  const { projectId, F, aiIds, aiEnabled, canWrite, reloadAi, addLog, toast } = useB();
  const [run, setRun] = useState<string | null>(null);
  const stop = useRef(false);
  const pend = useMemo(() => F.screen.filter((r) => !aiIds.has(r.key)), [F, aiIds]);

  async function start() {
    stop.current = false;
    const todo = pend.slice(0, 200);
    let n = 0, model = "", last = "";
    for (let i = 0; i < todo.length && !stop.current; i += 20) {
      const batch = todo.slice(i, i + 20);
      setRun(`Classificando ${fmtN(i + 1)}–${fmtN(i + batch.length)} de ${fmtN(todo.length)}…`);
      const res = await fetch(`/api/projects/${projectId}/ai`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: batch.map((r) => r.key) }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { last = d.error || "Um lote falhou."; if (d.fatal) break; continue; }
      n += d.saved ?? 0;
      model = d.model || model;
    }
    if (n) await addLog({ stage: "Triagem de títulos e resumos", tool: `Claude (${model}), via Pipeline RSL`, what: `Sugeriu incluir, talvez ou excluir para ${n} registros, com base no título, no resumo e nos critérios do protocolo.`, check: "Sugestão exibida ao revisor só depois da decisão dele; todas as decisões foram tomadas por revisores humanos.", auto: true });
    await reloadAi();
    setRun(null);
    toast((stop.current ? "Interrompido. " : "") + `${fmtN(n)} sugestões registradas.` + (last ? " " + last : ""));
  }

  return (
    <div className="panel">
      <header><h2>Sugestão da IA (opcional)</h2><p>A IA classifica os registros contra os critérios do protocolo. A sugestão só aparece para um revisor depois que ele decide, para não influenciar a decisão. Ela nunca inclui nem exclui sozinha.</p></header>
      <div className="ai-box">
        <div className="row"><span className="stat"><b>{fmtN(F.screen.length - pend.length)}</b> com sugestão</span><span className="stat"><b>{fmtN(pend.length)}</b> sem sugestão</span></div>
        {aiEnabled ? (
          <div className="row">
            <button className="btn ghost" disabled={!pend.length || !canWrite || !!run} onClick={start}>Pedir sugestões para {fmtN(Math.min(pend.length, 200))} registros</button>
            {run && <button className="btn danger small" onClick={() => (stop.current = true)}>Parar</button>}
            <span className="note" role="status">{run ?? "Cada pedido envia até 20 registros e consome créditos da API da Anthropic configurada no servidor."}</span>
          </div>
        ) : <p className="note">Para habilitar, defina <span className="mono">ANTHROPIC_API_KEY</span> nas variáveis de ambiente do servidor.</p>}
      </div>
    </div>
  );
}
