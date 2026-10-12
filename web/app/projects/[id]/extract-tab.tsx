"use client";
import { useMemo, useState } from "react";
import { FIELD_NAMES, parseCodes, suggestCodes } from "@/lib/criteria";
import { csvRow, downloadCSV } from "@/lib/download";
import { normDoi } from "@/lib/funnel";
import { extractPool } from "@/lib/screening";
import type { KeyedRecord, ResearchQuestion } from "@/lib/types";
import { srcLabel, useHighlight } from "./screen-tab";
import { useB, type ExEntry } from "./store";
import Translation from "./translation";

const fmtN = (n: number) => n.toLocaleString("pt-BR");
const sqKey = (s: ResearchQuestion, i: number) => s.id || "SQ" + (i + 1);
const sid = (i: number) => "S" + String(i + 1).padStart(2, "0");
type ExStatus = "done" | "wip" | "todo";
const exStatus = (e?: ExEntry): ExStatus => (e?.done ? "done" : e && Object.keys(e.data).length ? "wip" : "todo");
const EX_LABEL: Record<ExStatus, [string, string]> = { done: ["inc", "Concluída"], wip: ["may", "Em andamento"], todo: ["pend", "Não iniciada"] };

export default function ExtractTab() {
  const { protocol: p, S, ex } = useB();
  const [view, setView] = useState<"form" | "matrix">("form");
  const pool = useMemo(() => extractPool(S), [S]);
  const sqs = p.sqs || [];
  const done = pool.filter((r) => exStatus(ex[r.key]) === "done").length, wip = pool.filter((r) => exStatus(ex[r.key]) === "wip").length;
  return (
    <section className="stack">
      <div className="panel">
        <header><h2>Extração de dados</h2><p>Uma seção por questão secundária. As categorias sugeridas vêm do livro de códigos de cada questão, aplicado ao título, ao resumo e às palavras-chave. Aceite, recuse ou acrescente categorias e registre o trecho que sustenta cada uma.</p></header>
        <div className="stats"><span className="stat"><b>{fmtN(pool.length)}</b> estudos incluídos</span><span className="stat ok"><b>{fmtN(done)}</b> concluídos</span><span className="stat warn"><b>{fmtN(wip)}</b> em andamento</span><span className="stat"><b>{fmtN(pool.length - done - wip)}</b> não iniciados</span></div>
        <div className="seg" role="group" aria-label="Visão"><button aria-pressed={view === "form"} onClick={() => setView("form")}>Formulário</button><button aria-pressed={view === "matrix"} onClick={() => setView("matrix")}>Matriz e taxonomia</button></div>
      </div>
      {!pool.length ? <div className="empty"><b>Nenhum estudo incluído ainda</b>Os estudos aparecem aqui quando a decisão final da etapa de elegibilidade for incluir.</div>
        : !sqs.length ? <div className="empty"><b>Sem questões secundárias</b>Cadastre as questões secundárias e seus livros de códigos no Protocolo.</div>
        : view === "matrix" ? <Matrix pool={pool} sqs={sqs} /> : <Form pool={pool} sqs={sqs} />}
    </section>
  );
}

function Form({ pool, sqs }: { pool: KeyedRecord[]; sqs: ResearchQuestion[] }) {
  const { protocol: p, ex, saveEx, canWrite, nameOf } = useB();
  const hl = useHighlight(p);
  const [cur, setCur] = useState<string | null>(null);
  const i = Math.max(0, pool.findIndex((r) => r.key === cur));
  const r = pool[i];
  const e = ex[r.key] ?? { data: {}, done: false };
  const doi = normDoi(r.doi);
  /** Altera a entrada de uma questão; entradas vazias não são gravadas. */
  const edit = (key: string, mut: (d: { a: string[]; x: string[]; n: string }) => void) => saveEx(r.key, (x) => {
    const d = { a: x.data[key]?.a ?? [], x: x.data[key]?.x ?? [], n: x.data[key]?.n ?? "" };
    mut(d);
    if (d.a.length || d.x.length || d.n) x.data[key] = d; else delete x.data[key];
  });
  return (
    <div className="panel">
      <div className="ftlay">
        <div className="list">
          {pool.map((x, j) => { const [cls, text] = EX_LABEL[exStatus(ex[x.key])]; return (
            <button className="li" key={x.key} aria-current={j === i} onClick={() => setCur(x.key)}>
              <span><span className="lt"><span className="mono">{sid(j)}</span> {x.title}</span><span className="lm">{x.year ?? ""} · {srcLabel(x.source)}</span></span><span className={"pill " + cls}>{text}</span>
            </button>
          ); })}
        </div>
        <article className="card" key={r.key}>
          <div className="meta"><span className="mono">{sid(i)}</span><span className="src">{srcLabel(r.source)}</span>{r.year && <span className="mono">{r.year}</span>}{r.venue && <span>{r.venue}</span>}</div>
          <h2 className="t">{r.title}</h2>
          {r.authors && <p className="au">{r.authors.length > 200 ? r.authors.slice(0, 200) + "…" : r.authors}</p>}
          <details open={!!r.abstract}><summary className="note">Resumo e palavras-chave</summary>{r.abstract ? <p className="ab">{r.abstract}</p> : <p className="ab none">Sem resumo.</p>}{r.keywords && <p className="note"><b>Palavras-chave:</b> {r.keywords}</p>}</details>
          <Translation id={r.key} title={r.title} abstract={r.abstract} />
          {doi && <a className="link" href={"https://doi.org/" + doi} target="_blank" rel="noopener noreferrer">doi.org/{doi}</a>}
          {sqs.map((s, j) => {
            const key = sqKey(s, j), d = e.data[key] ?? {}, acc = d.a ?? [], rej = d.x ?? [];
            const codes = parseCodes(s.codes);
            const sugg = suggestCodes(r, s.codes).filter((x) => !acc.includes(x.cat) && !rej.includes(x.cat));
            return (
              <section className="exsec" key={key}>
                <header><span className="mono">{key}</span><b>{s.label}</b></header>
                <p className="note">{s.pt || s.en}</p>
                {acc.length > 0 && <div className="chips">{acc.map((c) => <span className="chip ok" key={c}>{c}{canWrite && <button aria-label={"Remover " + c} onClick={() => edit(key, (x) => { x.a = x.a.filter((y) => y !== c); })}>×</button>}</span>)}</div>}
                {sugg.length ? (
                  <div className="sugg">{sugg.map((x) => (
                    <div className="sg" key={x.cat}><div><b>{x.cat}</b><span className="ev">“{x.term}” no {FIELD_NAMES[x.field]}: {hl(x.snip)}</span></div>
                      {canWrite && <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                        <button className="cbtn good" onClick={() => edit(key, (y) => { y.a = [...new Set([...y.a, x.cat])]; if (!y.n) y.n = x.snip; })}>Aceitar</button>
                        <button className="cbtn bad" onClick={() => edit(key, (y) => { y.x = [...new Set([...y.x, x.cat])]; })}>Recusar</button>
                      </span>}
                    </div>
                  ))}</div>
                ) : <p className="note">{codes.length ? "Nenhuma sugestão pendente para esta questão." : "Sem livro de códigos para esta questão. Cadastre categorias no Protocolo para receber sugestões."}</p>}
                {rej.length > 0 && <p className="note">Recusadas: {rej.join(", ")} {canWrite && <button className="link" onClick={() => edit(key, (x) => { x.x = []; })}>desfazer</button>}</p>}
                <div className="grid2">
                  <label className="f">Outra categoria
                    <input type="text" placeholder="Digite e tecle Enter" disabled={!canWrite} list={"dl-" + key}
                      onKeyDown={(ev) => { if (ev.key !== "Enter") return; ev.preventDefault(); const el = ev.currentTarget, v = el.value.trim(); if (!v) return; edit(key, (x) => { x.a = [...new Set([...x.a, v])]; }); el.value = ""; }} />
                    <datalist id={"dl-" + key}>{codes.map((c) => <option key={c.cat} value={c.cat} />)}</datalist>
                  </label>
                  <label className="f">Evidência / observações<textarea rows={2} disabled={!canWrite} placeholder="Trecho do resumo que sustenta a codificação" value={d.n ?? ""} onChange={(ev) => edit(key, (x) => { x.n = ev.target.value; })} /></label>
                </div>
              </section>
            );
          })}
          <div className="decide"><label className="check"><input type="checkbox" checked={e.done} disabled={!canWrite} onChange={(ev) => saveEx(r.key, (x) => { x.done = ev.target.checked; })} /><span>Extração deste estudo concluída</span></label>{e.by && <span className="note">Última edição: {nameOf(e.by)}</span>}</div>
          <div className="nav"><button className="btn ghost small" disabled={i === 0} onClick={() => setCur(pool[i - 1].key)}>← Anterior</button><button className="btn ghost small" disabled={i >= pool.length - 1} onClick={() => setCur(pool[i + 1].key)}>Próximo →</button></div>
        </article>
      </div>
    </div>
  );
}

function Matrix({ pool, sqs }: { pool: KeyedRecord[]; sqs: ResearchQuestion[] }) {
  const { ex } = useB();
  const keys = sqs.map(sqKey);
  const [cross, setCross] = useState<{ a: string; b: string } | null>(null);
  const rows = useMemo(() => pool.map((r, i) => ({ id: sid(i), r, done: !!ex[r.key]?.done, cats: Object.fromEntries(keys.map((k) => [k, ex[r.key]?.data[k]?.a ?? []])) as Record<string, string[]> })), [pool, ex, keys.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const freq = sqs.map((s, j) => {
    const f: Record<string, number> = {};
    rows.forEach((r) => r.cats[keys[j]].forEach((c) => (f[c] = (f[c] || 0) + 1)));
    return { key: keys[j], label: s.label, f: Object.entries(f).sort((a, b) => b[1] - a[1]) };
  });
  const ca = cross?.a ?? keys[0], cb = cross?.b ?? keys[Math.min(1, keys.length - 1)];
  const catsA = [...new Set(rows.flatMap((r) => r.cats[ca] ?? []))], catsB = [...new Set(rows.flatMap((r) => r.cats[cb] ?? []))];
  const table = catsA.map((a) => catsB.map((b) => rows.filter((r) => r.cats[ca]?.includes(a) && r.cats[cb]?.includes(b)).length));
  const max = Math.max(1, ...table.flat());

  const wide = () => downloadCSV("matriz_extracao.csv", [csvRow(["id", "title", "authors", "year", "venue", "doi", ...keys, "extracao_concluida"]), ...rows.map((r) => csvRow([r.id, r.r.title, r.r.authors, r.r.year, r.r.venue, r.r.doi, ...keys.map((k) => r.cats[k].join("; ")), r.done ? "sim" : "não"]))]);
  const long = () => downloadCSV("codificacao_extracao.csv", [csvRow(["id", "title", "questao", "rotulo", "categoria", "evidencia"]), ...rows.flatMap((r) => sqs.flatMap((s, j) => r.cats[keys[j]].map((c) => csvRow([r.id, r.r.title, keys[j], s.label, c, ex[r.r.key]?.data[keys[j]]?.n ?? ""]))))]);

  return (
    <>
      <div className="panel">
        <header><h2>Matriz de extração</h2><p>Uma linha por estudo, uma coluna por questão secundária. É a base da taxonomia.</p></header>
        <div className="tbl"><table>
          <thead><tr><th>ID</th><th>Estudo</th>{sqs.map((s, j) => <th key={keys[j]}>{keys[j]}{s.label ? " · " + s.label : ""}</th>)}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}><td className="mono">{r.id}{!r.done && <> <span className="pill may">aberta</span></>}</td><td style={{ minWidth: 220 }}>{r.r.title} <span className="note">({r.r.year ?? ""})</span></td>
              {keys.map((k) => <td key={k}>{r.cats[k].join("; ") || <span className="muted">—</span>}</td>)}</tr>
          ))}</tbody>
        </table></div>
        <div className="row"><button className="btn" onClick={wide}>Matriz (CSV)</button><button className="btn ghost" onClick={long}>Codificação detalhada (CSV)</button></div>
      </div>
      <div className="panel">
        <header><h2>Frequência das categorias</h2></header>
        <div className="freqs">{freq.map((q) => (
          <div className="freq" key={q.key}><h3><span className="mono">{q.key}</span> {q.label}</h3>
            {q.f.length ? q.f.map(([c, n]) => <div className="fr" key={c}><span>{c}</span><span className="fbar"><span style={{ width: (n / pool.length) * 100 + "%" }} /></span><b className="mono">{n}</b></div>) : <p className="note">Nenhuma categoria aceita ainda.</p>}
          </div>
        ))}</div>
      </div>
      <div className="panel">
        <header><h2>Cruzamento entre questões</h2><p>Quantos estudos combinam cada par de categorias, como na cadeia competência → evidência → método.</p></header>
        <div className="row">
          <select aria-label="Linhas" value={ca} onChange={(e) => setCross({ a: e.target.value, b: cb })} style={{ width: "auto" }}>{keys.map((k) => <option key={k}>{k}</option>)}</select><span className="note">×</span>
          <select aria-label="Colunas" value={cb} onChange={(e) => setCross({ a: ca, b: e.target.value })} style={{ width: "auto" }}>{keys.map((k) => <option key={k}>{k}</option>)}</select>
        </div>
        {catsA.length && catsB.length ? (
          <div className="tbl"><table className="cross">
            <thead><tr><th>{ca} \ {cb}</th>{catsB.map((b) => <th key={b}>{b}</th>)}</tr></thead>
            <tbody>{catsA.map((a, i) => <tr key={a}><td>{a}</td>{table[i].map((n, j) => <td key={j} className="num" style={{ background: `color-mix(in srgb,var(--accent) ${Math.round((n / max) * 55)}%,transparent)` }}>{n || ""}</td>)}</tr>)}</tbody>
          </table></div>
        ) : <p className="note">Aceite categorias nas duas questões para ver o cruzamento.</p>}
      </div>
    </>
  );
}
