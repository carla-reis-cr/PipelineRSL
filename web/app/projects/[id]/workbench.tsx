"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { parseFile } from "@/lib/parsers";
import { SOURCE_LABELS } from "@/lib/types";

type Src = { id: string; label: string; string?: string };
type Imp = { id: string; source: string; method: string; file_name: string | null; query: string | null; total_reported: number | null; record_count: number; status: string; error: string | null; created_at: string };
type Funnel = { identified: number; duplicates: number; automation: number; screen: number; bySource: Record<string, { identified: number; duplicates: number; automation: number; screen: number }>; autoReasons: Record<string, number>; criteria: Record<string, { y: number; n: number; u: number }> };

const label = (s: string) => SOURCE_LABELS[s as keyof typeof SOURCE_LABELS] ?? s;
const n = (x: number | null | undefined) => (x ?? 0).toLocaleString("pt-BR");

export default function Workbench({ projectId, apiSources, manualSources, imports }: { projectId: string; apiSources: Src[]; manualSources: Src[]; imports: Imp[] }) {
  const router = useRouter();
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const loadFunnel = useCallback(async () => {
    const r = await fetch(`/api/projects/${projectId}/funnel`);
    if (r.ok) setFunnel(await r.json());
  }, [projectId]);
  useEffect(() => { loadFunnel(); }, [loadFunnel]);
  const refresh = () => { router.refresh(); loadFunnel(); };

  return (
    <>
      <div className="panel">
        <h2>Busca por API</h2>
        <p className="muted">As chaves ficam no servidor. A busca é feita página a página e pode ser retomada se a cota da base acabar.</p>
        {apiSources.length ? apiSources.map((s) => <ApiSearch key={s.id} projectId={projectId} source={s} paused={imports.find((i) => i.source === s.id && i.method === "api" && (i.status === "paused" || i.status === "running"))} onDone={refresh} />)
          : <p className="muted">Nenhuma base com API no protocolo (Scopus ou IEEE Xplore).</p>}
      </div>

      <div className="panel">
        <h2>Importar arquivo exportado</h2>
        {manualSources.map((s) => (
          <details key={s.id}><summary>String para {s.label}</summary><pre>{s.string}</pre></details>
        ))}
        <FileImport projectId={projectId} sources={[...apiSources, ...manualSources]} onDone={refresh} />
      </div>

      <div className="panel">
        <h2>Importações</h2>
        {imports.length ? (
          <table><thead><tr><th>Base</th><th>Origem</th><th className="n">Informado</th><th className="n">Importado</th><th>Situação</th></tr></thead><tbody>
            {imports.map((i) => (
              <tr key={i.id}><td>{label(i.source)}</td><td>{i.method === "api" ? "API" : i.file_name}</td><td className="n">{i.total_reported != null ? n(i.total_reported) : "—"}</td><td className="n">{n(i.record_count)}</td>
                <td>{({ done: "Concluída", running: "Em andamento", paused: "Pausada (cota)", error: "Erro" } as Record<string, string>)[i.status] ?? i.status}{i.error && <div className="err">{i.error}</div>}</td></tr>
            ))}
          </tbody></table>
        ) : <p className="muted">Nenhuma importação ainda.</p>}
      </div>

      <div className="panel">
        <h2>Pré-triagem e critérios</h2>
        {funnel ? (
          <>
            <p>{n(funnel.identified)} identificados · {n(funnel.duplicates)} duplicados · {n(funnel.automation)} removidos por filtro automático · <b>{n(funnel.screen)} seguem para a triagem</b></p>
            {Object.keys(funnel.autoReasons).length > 0 && <p className="muted">Filtro automático: {Object.entries(funnel.autoReasons).map(([k, v]) => `${k} (${n(v)})`).join(" · ")}</p>}
            {Object.keys(funnel.criteria).length > 0 && (
              <table><thead><tr><th>Critério</th><th className="n">Atende / aplica</th><th className="n">Não</th><th className="n">Indeterminado</th></tr></thead><tbody>
                {Object.entries(funnel.criteria).map(([c, v]) => <tr key={c}><td className="mono">{c}</td><td className="n">{n(v.y)}</td><td className="n">{n(v.n)}</td><td className="n">{n(v.u)}</td></tr>)}
              </tbody></table>
            )}
          </>
        ) : <p className="muted">Calculando…</p>}
      </div>
    </>
  );
}

function ApiSearch({ projectId, source, paused, onDone }: { projectId: string; source: Src; paused?: Imp; onDone: () => void }) {
  const [state, setState] = useState<{ running: boolean; fetched: number; total: number; msg?: string; err?: string; query?: string }>({ running: false, fetched: 0, total: 0 });
  const stop = useRef(false);
  async function run(resumeId?: string) {
    stop.current = false;
    let importId = resumeId;
    setState({ running: true, fetched: paused?.record_count ?? 0, total: paused?.total_reported ?? 0 });
    for (;;) {
      if (stop.current) { setState((s) => ({ ...s, running: false, msg: "Interrompida. Pode retomar depois." })); break; }
      const r = await fetch(`/api/projects/${projectId}/search`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: source.id, importId }) });
      const d = await r.json();
      importId = d.importId;
      if (!r.ok) { setState((s) => ({ ...s, running: false, err: d.error })); break; }
      setState({ running: !d.done, fetched: d.fetched, total: d.total, query: d.query, msg: d.notes?.join(" ") });
      if (d.done) break;
    }
    onDone();
  }
  const pct = state.total ? Math.min(100, (state.fetched / state.total) * 100) : 0;
  return (
    <div className="panel" style={{ background: "var(--bg)" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <b>{source.label}</b>
        <span className="row">
          {state.running ? <button className="btn ghost" onClick={() => (stop.current = true)}>Parar</button>
            : paused ? <button className="btn" onClick={() => run(paused.id)}>Retomar ({n(paused.record_count)} de {n(paused.total_reported)})</button>
            : <button className="btn" onClick={() => run()}>Buscar</button>}
        </span>
      </div>
      {(state.running || state.fetched > 0) && <><div className="bar"><span style={{ width: `${pct}%` }} /></div><p className="mono">{n(state.fetched)} de {n(state.total)}</p></>}
      {state.query && <details><summary>Query enviada</summary><pre>{state.query}</pre></details>}
      {state.msg && <p className="muted">{state.msg}</p>}
      {state.err && <p className="err">{state.err}</p>}
    </div>
  );
}

function FileImport({ projectId, sources, onDone }: { projectId: string; sources: Src[]; onDone: () => void }) {
  const [file, setFile] = useState<{ name: string; parsed: ReturnType<typeof parseFile> } | null>(null);
  const [source, setSource] = useState("");
  const [progress, setProgress] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const parsed = parseFile(f.name, await f.text());
    setFile({ name: f.name, parsed });
    setSource(parsed.hasSourceColumn ? "" : parsed.guessedSource || sources[0]?.id || "other");
    setErr(parsed.error ?? null);
  }
  async function send() {
    if (!file) return;
    const recs = file.parsed.records.map((r) => (file.parsed.hasSourceColumn ? r : { ...r, source }));
    let importId: string | undefined;
    for (let i = 0; i < recs.length; i += 1000) {
      const chunk = recs.slice(i, i + 1000);
      const r = await fetch(`/api/projects/${projectId}/import`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileName: file.name, source: source || "varias", records: chunk, importId, offset: i, last: i + 1000 >= recs.length }) });
      const d = await r.json();
      if (!r.ok) { setErr(d.error); return; }
      importId = d.importId;
      setProgress(`${n(Math.min(i + 1000, recs.length))} de ${n(recs.length)} enviados`);
    }
    setProgress(`Importação concluída: ${n(recs.length)} registros.`);
    setFile(null);
    onDone();
  }
  return (
    <div className="row" style={{ alignItems: "flex-end" }}>
      <label>Arquivo (BibTeX, RIS, CSV, texto do WoS)<br /><input type="file" accept=".bib,.ris,.csv,.txt,.tsv" onChange={onPick} /></label>
      {file && (
        <>
          {!file.parsed.hasSourceColumn && (
            <label>Base<br /><select value={source} onChange={(e) => setSource(e.target.value)}>
              {[...new Set([...sources.map((s) => s.id), ...Object.keys(SOURCE_LABELS)])].map((s) => <option key={s} value={s}>{label(s)}</option>)}
            </select></label>
          )}
          <button className="btn" onClick={send} disabled={!file.parsed.records.length}>Importar {n(file.parsed.records.length)} registros</button>
        </>
      )}
      {progress && <p className="ok">{progress}</p>}
      {err && <p className="err">{err}</p>}
    </div>
  );
}
