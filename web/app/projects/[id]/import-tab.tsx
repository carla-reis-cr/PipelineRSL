"use client";
import { useMemo, useRef, useState } from "react";
import { parseFile } from "@/lib/parsers";
import { buildStrings, intOr } from "@/lib/protocol";
import { SOURCE_LABELS } from "@/lib/types";
import { useB, type ImportRow } from "./store";

const label = (s: string) => SOURCE_LABELS[s as keyof typeof SOURCE_LABELS] ?? s;
const n = (x: number | null | undefined) => (x ?? 0).toLocaleString("pt-BR");
const FMT: Record<string, string> = { bib: "BibTeX", ris: "RIS", wos: "Web of Science (texto)", csv: "CSV/TSV" };
const STATUS: Record<string, string> = { done: "Concluída", running: "Em andamento", paused: "Pausada (cota)", error: "Erro" };

export default function ImportTab({ apiIds }: { apiIds: string[] }) {
  const { protocol, imports, F, canWrite, reloadRecords, removeImport } = useB();
  const [confirmRm, setConfirmRm] = useState<string | null>(null);
  const sources = [...new Set((protocol.sources ?? []).map((s) => s.id).filter(Boolean))];
  const apiSources = sources.filter((s) => apiIds.includes(s));
  const strings = useMemo(() => buildStrings(protocol), [protocol]);

  const per = useMemo(() => {
    const m: Record<string, { n: number; ab: number; dup: number; auto: number }> = {};
    for (const r of F.recs) {
      const s = (m[r.source] ??= { n: 0, ab: 0, dup: 0, auto: 0 });
      s.n++;
      if (r.abstract) s.ab++;
      if (F.dupOf[r.key]) s.dup++; else if (F.auto[r.key]) s.auto++;
    }
    return m;
  }, [F]);
  const rows = [...new Set([...sources, ...Object.keys(per)])];
  const reported = (id: string) => intOr(protocol.sources?.find((x) => x.id === id)?.reported);

  return (
    <section className="stack">
      <div className="panel">
        <header><h2>Busca por API</h2><p>As chaves ficam no servidor. A busca é feita página a página e pode ser retomada se a cota da base acabar.</p></header>
        {apiSources.length ? apiSources.map((s) => (
          <ApiSearch key={s} source={s} paused={imports.find((i) => i.source === s && i.method === "api" && (i.status === "paused" || i.status === "running"))} />
        )) : <div className="empty"><b>Nenhuma base com API no protocolo</b>Scopus e IEEE Xplore têm busca por API. Cadastre-as em Fontes de informação, na aba Protocolo.</div>}
      </div>

      <div className="panel">
        <header><h2>Importar arquivos exportados</h2><p>Para as bases sem API, cole a string no site da base, exporte os resultados e solte os arquivos aqui.</p></header>
        {strings.filter((s) => !apiIds.includes(s.id)).map((s) => <details key={s.id}><summary>String para {s.label}</summary><pre>{s.s}</pre>{s.notes.length > 0 && <p className="note">{s.notes.join(" ")}</p>}</details>)}
        <FileImport sources={sources} />
        <div className="callout">Como exportar: <b>Scopus</b> Export → CSV com &quot;Citation information&quot; e &quot;Abstract &amp; keywords&quot;. <b>Web of Science</b> Export → Plain text file ou Tab delimited, &quot;Full Record&quot;. <b>ACM DL</b> selecione todos → Export Citations → BibTeX. Cada base tem limite por exportação (Scopus 20.000 em CSV, WoS 1.000 por vez), então divida em lotes e importe todos para a mesma base.</div>
      </div>

      <div className="panel">
        <header><h2>Registros por base</h2><p>Compare o total importado com o total que a base informou (preenchido em Fontes de informação). Diferenças indicam exportação incompleta.</p></header>
        {rows.length > 0 && (
          <div className="tbl"><table>
            <thead><tr><th>Base</th><th className="num">Informado</th><th className="num">Importado</th><th className="num">Com resumo</th><th className="num">Duplicados</th><th className="num">Filtro automático</th></tr></thead>
            <tbody>{rows.map((id) => {
              const p = per[id] ?? { n: 0, ab: 0, dup: 0, auto: 0 }, rep = reported(id);
              return (
                <tr key={id}><td>{label(id)}</td><td className="num">{rep != null ? n(rep) : "—"}</td>
                  <td className="num">{n(p.n)} {rep != null && p.n > 0 && rep !== p.n && <span className={"pill " + (Math.abs(rep - p.n) / rep > 0.02 ? "conf" : "may")}>{p.n > rep ? "+" : ""}{n(p.n - rep)}</span>}</td>
                  <td className="num">{p.n ? Math.round((p.ab / p.n) * 100) + "%" : "—"}</td><td className="num">{n(p.dup)}</td><td className="num">{n(p.auto)}</td></tr>
              );
            })}</tbody>
            <tfoot><tr><td>Total</td><td className="num">{n(rows.reduce((a, id) => a + (reported(id) ?? 0), 0))}</td><td className="num">{n(F.recs.length)}</td><td></td><td className="num">{n(Object.keys(F.dupOf).length)}</td><td className="num">{n(Object.keys(F.auto).length)}</td></tr></tfoot>
          </table></div>
        )}
        <h3>Importações</h3>
        {imports.length ? (
          <div className="tbl"><table>
            <thead><tr><th>Base</th><th>Origem</th><th>Data</th><th className="num">Informado</th><th className="num">Importado</th><th>Situação</th><th></th></tr></thead>
            <tbody>{imports.map((i) => (
              <tr key={i.id}><td>{i.source === "varias" ? "várias (source_db)" : label(i.source)}</td><td>{i.method === "api" ? "API" : i.file_name}</td><td className="mono">{i.created_at.slice(0, 10)}</td>
                <td className="num">{i.total_reported != null ? n(i.total_reported) : "—"}</td><td className="num">{n(i.record_count)}</td>
                <td>{STATUS[i.status] ?? i.status}{i.error && <div className="err">{i.error}</div>}</td>
                <td>{confirmRm === i.id
                  ? <><button className="btn danger small" onClick={async () => { setConfirmRm(null); await removeImport(i.id); }}>Confirmar remoção</button> <button className="link" onClick={() => setConfirmRm(null)}>cancelar</button></>
                  : <button className="link" disabled={!canWrite} onClick={() => setConfirmRm(i.id)}>Remover</button>}</td></tr>
            ))}</tbody>
          </table></div>
        ) : <div className="empty"><b>Nenhuma importação ainda</b>Busque por API ou solte acima os arquivos exportados. Os registros entram na triagem depois de passar pelos filtros e pela remoção de duplicatas.</div>}
        <div className="row"><button className="btn ghost small" onClick={() => reloadRecords()}>Recarregar registros</button></div>
      </div>
    </section>
  );
}

function ApiSearch({ source, paused }: { source: string; paused?: ImportRow }) {
  const { projectId, canWrite, reloadRecords } = useB();
  const [state, setState] = useState<{ running: boolean; fetched: number; total: number; msg?: string; err?: string; query?: string }>({ running: false, fetched: 0, total: 0 });
  const stop = useRef(false);
  async function run(resumeId?: string) {
    stop.current = false;
    let importId = resumeId;
    setState({ running: true, fetched: paused?.record_count ?? 0, total: paused?.total_reported ?? 0 });
    for (;;) {
      if (stop.current) { setState((s) => ({ ...s, running: false, msg: "Interrompida. Pode retomar depois." })); break; }
      const r = await fetch(`/api/projects/${projectId}/search`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source, importId }) });
      const d = await r.json();
      importId = d.importId;
      if (!r.ok) { setState((s) => ({ ...s, running: false, err: d.error })); break; }
      setState({ running: !d.done, fetched: d.fetched, total: d.total, query: d.query, msg: d.notes?.join(" ") });
      if (d.done) break;
    }
    await reloadRecords();
  }
  const pct = state.total ? Math.min(100, (state.fetched / state.total) * 100) : 0;
  return (
    <div className="ai-box">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <b>{label(source)}</b>
        {state.running ? <button className="btn ghost" onClick={() => (stop.current = true)}>Parar</button>
          : paused ? <button className="btn" disabled={!canWrite} onClick={() => run(paused.id)}>Retomar ({n(paused.record_count)} de {n(paused.total_reported)})</button>
          : <button className="btn" disabled={!canWrite} onClick={() => run()}>Buscar</button>}
      </div>
      {(state.running || state.fetched > 0) && <><div className="bar"><span style={{ width: `${pct}%` }} /></div><p className="mono">{n(state.fetched)} de {n(state.total)}</p></>}
      {state.query && <details><summary>Query enviada</summary><pre>{state.query}</pre></details>}
      {state.msg && <p className="muted">{state.msg}</p>}
      {state.err && <p className="err">{state.err}</p>}
    </div>
  );
}

interface Staged { id: string; name: string; fmt: string; parsed: ReturnType<typeof parseFile>; source: string; error: string }
const COL = "__col"; // usar a coluna source_db do próprio arquivo

function FileImport({ sources }: { sources: string[] }) {
  const { projectId, canWrite, reloadRecords, toast } = useB();
  const [staged, setStaged] = useState<Staged[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function stage(files: FileList | null) {
    const add: Staged[] = [];
    for (const f of Array.from(files ?? [])) {
      const id = f.name + ":" + f.size + ":" + f.lastModified;
      try {
        const parsed = parseFile(f.name, await f.text());
        add.push({ id, name: f.name, fmt: parsed.format, parsed, source: parsed.hasSourceColumn ? COL : parsed.guessedSource || sources[0] || "other", error: parsed.error || (parsed.records.length ? "" : "Nenhum registro reconhecido neste arquivo.") });
      } catch {
        add.push({ id, name: f.name, fmt: "?", parsed: { format: "csv", records: [], hasSourceColumn: false, guessedSource: "" }, source: "other", error: "Não foi possível ler o arquivo." });
      }
    }
    setStaged((s) => [...s.filter((x) => !add.some((a) => a.id === x.id)), ...add]);
  }

  async function send() {
    setBusy(true);
    const todo = staged.filter((s) => s.parsed.records.length);
    const total = todo.reduce((a, s) => a + s.parsed.records.length, 0);
    let done = 0;
    for (const s of todo) {
      const recs = s.source === COL ? s.parsed.records : s.parsed.records.map((r) => ({ ...r, source: s.source }));
      let importId: string | undefined;
      let failed = "";
      // lotes de 1.000 para caber no limite de tamanho por requisição da Vercel
      for (let i = 0; i < recs.length && !failed; i += 1000) {
        const r = await fetch(`/api/projects/${projectId}/import`, { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ fileName: s.name, source: s.source === COL ? "varias" : s.source, records: recs.slice(i, i + 1000), importId, offset: i, last: i + 1000 >= recs.length }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) failed = d.error || "erro " + r.status;
        importId = d.importId ?? importId;
        done += Math.min(1000, recs.length - i);
        setProgress(`Enviando… ${n(done)} de ${n(total)}`);
      }
      if (failed) { setProgress(`A importação de ${s.name} falhou: ${failed}`); setBusy(false); await reloadRecords(); return; }
      setStaged((cur) => cur.filter((x) => x.id !== s.id));
    }
    setProgress("");
    setBusy(false);
    toast(`Importação concluída: ${n(total)} registros.`);
    await reloadRecords();
  }

  const options = [...new Set([...sources, ...Object.keys(SOURCE_LABELS)])];
  const total = staged.reduce((a, s) => a + s.parsed.records.length, 0);
  return (
    <>
      <div className={"drop" + (over ? " over" : "")}
        onDragEnter={(e) => { e.preventDefault(); setOver(true); }} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); stage(e.dataTransfer.files); }}>
        <b>Solte os arquivos aqui</b>
        <span className="fmt">BibTeX (.bib) · RIS (.ris) · CSV do Scopus · texto ou TSV do Web of Science · Publish or Perish · CSV com a coluna source_db</span>
        <button className="btn ghost small" onClick={() => input.current?.click()}>Escolher arquivos</button>
        <input ref={input} type="file" multiple accept=".bib,.ris,.csv,.txt,.tsv,.nbib" hidden onChange={(e) => { stage(e.target.files); e.target.value = ""; }} />
      </div>
      {staged.length > 0 && (
        <>
          <div className="tbl"><table>
            <thead><tr><th>Arquivo</th><th>Formato</th><th className="num">Registros</th><th className="num">Com resumo</th><th>Base</th><th></th></tr></thead>
            <tbody>{staged.map((s) => (
              <tr key={s.id}><td>{s.name}{s.error && <div className="err note">{s.error}</div>}</td><td>{FMT[s.fmt] ?? s.fmt}</td><td className="num">{n(s.parsed.records.length)}</td><td className="num">{n(s.parsed.records.filter((r) => r.abstract).length)}</td>
                <td><select aria-label="Base de origem" value={s.source} onChange={(e) => setStaged((cur) => cur.map((x) => (x.id === s.id ? { ...x, source: e.target.value } : x)))}>
                  {s.parsed.hasSourceColumn && <option value={COL}>Usar a coluna source_db</option>}
                  {options.map((id) => <option key={id} value={id}>{label(id)}</option>)}
                </select></td>
                <td><button className="btn danger small" disabled={busy} onClick={() => setStaged((cur) => cur.filter((x) => x.id !== s.id))}>Descartar</button></td></tr>
            ))}</tbody>
          </table></div>
          <div className="row"><button className="btn" disabled={!canWrite || busy || !total} onClick={send}>Importar {n(total)} registros</button><span className="note">{progress}</span></div>
        </>
      )}
      {!staged.length && progress && <p className="err">{progress}</p>}
    </>
  );
}
