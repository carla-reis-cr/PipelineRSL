"use client";
import { useMemo, useState } from "react";
import { buildDeclaration, metrics, pct } from "@/lib/screening";
import { useB } from "./store";

const fmtN = (n: number) => n.toLocaleString("pt-BR");
const STAGES = ["Protocolo", "Estratégia de busca", "Triagem de títulos e resumos", "Texto completo", "Extração de dados", "Redação"];

export default function AiTab() {
  const { F, S, votes, ai, r1, r2, mode, aiLog, addLog, removeLog, canWrite, toast } = useB();
  const m = useMemo(() => metrics(F, S, votes, ai, r1, r2), [F, S, votes, ai, r1, r2]);
  const decl = useMemo(() => buildDeclaration(aiLog, m, mode), [aiLog, m, mode]);
  const [form, setForm] = useState({ stage: STAGES[0], tool: "", what: "", check: "" });
  const [err, setErr] = useState("");
  const field = (k: keyof typeof form) => ({ value: form[k], disabled: !canWrite, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value }) });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const tool = form.tool.trim(), what = form.what.trim(), check = form.check.trim();
    if (!tool || !what) { setErr("Preencha a ferramenta e o que a IA fez."); return; }
    await addLog({ stage: form.stage, tool, what, check });
    setForm({ ...form, tool: "", what: "", check: "" });
    setErr(check ? "" : "Lembre de dizer como o resultado foi verificado.");
  }
  async function copy() {
    try { await navigator.clipboard.writeText(decl); toast("Copiado."); }
    catch { toast("Não foi possível copiar. Selecione o texto e copie manualmente."); }
  }

  return (
    <section className="stack">
      <div className="panel">
        <header><h2>Concordância</h2><p>Números para relatar na seção de métodos. A IA é comparada com a decisão final humana; a concordância entre revisores usa incluir/talvez contra excluir. Com a triagem cega, entram só os registros em que você já votou.</p></header>
        <div className="metric">
          <div className="m"><b>{m.k == null ? "—" : m.k.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</b><span>Kappa de Cohen entre revisores ({fmtN(m.pairs)} registros)</span></div>
          <div className="m"><b>{pct(m.agree)}</b><span>Concordância bruta entre revisores</span></div>
          <div className="m"><b>{pct(m.sens)}</b><span>Sensibilidade da IA: incluídos pelos humanos que a IA não excluiu</span></div>
          <div className="m"><b>{pct(m.spec)}</b><span>Especificidade da IA ({fmtN(m.aiN)} registros com sugestão e decisão final)</span></div>
          <div className="m"><b>{fmtN(m.fn)}</b><span>Falsos negativos da IA: estudos que ela teria excluído e os humanos incluíram</span></div>
        </div>
      </div>

      <div className="panel">
        <header><h2>Registro de uso de IA</h2><p>As sugestões pedidas nesta ferramenta entram aqui sozinhas. Registre também o que foi feito fora dela.</p></header>
        <form className="grid2" onSubmit={submit} noValidate>
          <label className="f">Etapa<select {...field("stage")}>{STAGES.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label className="f">Ferramenta e versão<input type="text" {...field("tool")} placeholder="Ex.: Claude Opus 5.5 via API" /></label>
          <label className="f" style={{ gridColumn: "1/-1" }}>O que a IA fez<textarea {...field("what")} placeholder="Ex.: classificou títulos contra os critérios do protocolo, em lotes de 20" /></label>
          <label className="f" style={{ gridColumn: "1/-1" }}>Como foi verificado<textarea {...field("check")} placeholder="Ex.: dois revisores triaram todos os títulos de forma independente" /></label>
          <div className="row" style={{ gridColumn: "1/-1" }}><button className="btn" type="submit" disabled={!canWrite}>Adicionar ao registro</button><span className="note" role="status">{err}</span></div>
        </form>
        {aiLog.length ? (
          <div className="tbl"><table>
            <thead><tr><th>Data</th><th>Etapa</th><th>Ferramenta</th><th>O que fez</th><th>Verificação</th><th></th></tr></thead>
            <tbody>{aiLog.map((l) => (
              <tr key={l.id}><td className="mono">{l.date}</td><td>{l.stage}</td><td><b>{l.tool}</b>{l.auto && <> <span className="pill pend">automático</span></>}</td><td>{l.what}</td><td>{l.check || <span className="err">Não informada</span>}</td>
                <td>{canWrite && <button className="link" onClick={() => removeLog(l.id)}>Remover</button>}</td></tr>
            ))}</tbody>
          </table></div>
        ) : <div className="empty"><b>Nenhum uso de IA registrado</b>Se usou alguma ferramenta de IA em qualquer etapa da revisão, registre aqui com a versão do modelo.</div>}
      </div>

      <div className="panel">
        <header><h2>Declaração de uso de IA</h2><p>Texto montado a partir do registro e das métricas. Revise antes de colar no artigo.</p></header>
        <div className="decl">{decl}</div>
        <div className="row"><button className="btn" onClick={copy}>Copiar texto</button></div>
      </div>
    </section>
  );
}
