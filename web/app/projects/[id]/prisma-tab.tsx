"use client";
import { useMemo } from "react";
import { csvRow, download, downloadCSV } from "@/lib/download";
import { flowSVG } from "@/lib/prisma-flow";
import { extractPool, prismaCounts, type Vote } from "@/lib/screening";
import { srcLabel } from "./screen-tab";
import { useB } from "./store";

const fmtN = (n: number) => n.toLocaleString("pt-BR");

export default function PrismaTab() {
  const { protocol: p, F, S, votes, cons, ai, r1, r2 } = useB();
  const c = useMemo(() => prismaCounts(F, S), [F, S]);
  const svg = useMemo(() => flowSVG(c, p), [c, p]);

  const warn: string[] = [];
  if (!c.total) warn.push("Ainda não há registros importados. O fluxograma mostra zeros até a importação.");
  if (c.taPend) warn.push(fmtN(c.taPend) + " registros ainda estão na triagem de títulos e resumos (pendentes ou em conflito).");
  if (c.ftPend) warn.push(fmtN(c.ftPend) + " relatórios ainda estão em avaliação do texto completo.");
  if (c.reasons["Sem motivo"]) warn.push(c.reasons["Sem motivo"] + " exclusões no texto completo estão sem motivo. O PRISMA pede o motivo de cada exclusão.");

  const per = useMemo(() => {
    const m: Record<string, { id: number; dup: number; auto: number; scr: number; ta: number; inc: number }> = {};
    for (const r of F.recs) {
      const s = (m[r.source] ??= { id: 0, dup: 0, auto: 0, scr: 0, ta: 0, inc: 0 });
      s.id++;
      if (F.dupOf[r.key]) s.dup++;
      else if (F.auto[r.key]) s.auto++;
      else { s.scr++; if (S.ta[r.key]?.s === "inc") s.ta++; if (S.ft[r.key]?.s === "inc") s.inc++; }
    }
    return Object.entries(m).sort((a, b) => b[1].id - a[1].id);
  }, [F, S]);
  const autoReasons: Record<string, number> = {};
  Object.values(F.auto).forEach((v) => { const k = v.split(":")[0]; autoReasons[k] = (autoReasons[k] || 0) + 1; });

  function exportIncluded() {
    downloadCSV("estudos_incluidos.csv", [csvRow(["id", "source_db", "title", "authors", "year", "venue", "doi", "url", "abstract"]),
      ...extractPool(S).map((r, i) => csvRow(["S" + String(i + 1).padStart(2, "0"), r.source, r.title, r.authors, r.year, r.venue, r.doi, r.url, r.abstract]))]);
  }
  function exportAll() {
    const fv = (v?: Pick<Vote, "d" | "r"> | null) => (v ? v.d + (v.r ? ":" + v.r : "") : "");
    const of = (stage: "ta" | "ft", id: string | null, k: string) => (id ? votes[stage][id]?.[k] : null);
    downloadCSV("decisoes_triagem.csv", [csvRow(["source_db", "title", "year", "doi", "etapa_removido", "motivo_automatico", "duplicado_de", "ta_r1", "ta_r2", "ta_ia", "ta_consenso", "ta_final", "ft_r1", "ft_r2", "ft_consenso", "ft_final", "ft_motivo"]),
      ...F.recs.map((r) => {
        const k = r.key, dup = F.dupOf[k], auto = F.auto[k];
        return csvRow([r.source, r.title, r.year, r.doi, dup ? "duplicado" : auto ? "filtro automático" : "", auto || "", dup ? F.byK[dup]?.title || "" : "",
          fv(of("ta", r1, k)), fv(of("ta", r2, k)), ai[k] ? ai[k].d + (ai[k].c ? ":" + ai[k].c : "") : "", fv(cons.ta[k]), S.ta[k]?.s || "",
          fv(of("ft", r1, k)), fv(of("ft", r2, k)), fv(cons.ft[k]), S.ft[k]?.s || "", S.ft[k]?.r || ""]);
      })]);
  }

  return (
    <section className="stack">
      <div className="panel">
        <header><h2>Fluxograma PRISMA 2020</h2><p>Atualizado a cada decisão. Para revisões novas, modelo com bases de dados e registros.</p></header>
        {warn.length > 0 && <div className="callout warn">{warn.map((w) => <div key={w}>{w}</div>)}</div>}
        {/* SVG montado em lib/prisma-flow, com todo texto variável escapado */}
        <div className="flow" dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="row">
          <button className="btn" onClick={() => download("fluxograma_prisma_2020.svg", flowSVG(c, p, true), "image/svg+xml")}>Baixar fluxograma (SVG)</button>
          <button className="btn ghost" onClick={exportIncluded}>Estudos incluídos (CSV)</button>
          <button className="btn ghost" onClick={exportAll}>Todas as decisões (CSV)</button>
        </div>
      </div>
      <div className="panel">
        <header><h2>Funil por base</h2><p>Registros duplicados contam para a base em que apareceram primeiro.</p></header>
        {per.length ? (
          <>
            <div className="tbl"><table>
              <thead><tr><th>Base</th><th className="num">Identificados</th><th className="num">Duplicados</th><th className="num">Filtro automático</th><th className="num">Triados</th><th className="num">Passaram T/R</th><th className="num">Incluídos</th></tr></thead>
              <tbody>{per.map(([s, v]) => <tr key={s}><td>{srcLabel(s)}</td><td className="num">{fmtN(v.id)}</td><td className="num">{fmtN(v.dup)}</td><td className="num">{fmtN(v.auto)}</td><td className="num">{fmtN(v.scr)}</td><td className="num">{fmtN(v.ta)}</td><td className="num">{fmtN(v.inc)}</td></tr>)}</tbody>
            </table></div>
            {Object.keys(autoReasons).length > 0 && <p className="note">Filtro automático por motivo: {Object.entries(autoReasons).map(([k, n]) => `${k} (${fmtN(n)})`).join(" · ")}</p>}
          </>
        ) : <div className="empty"><b>Sem registros</b>O funil por base aparece depois da primeira importação.</div>}
      </div>
    </section>
  );
}
