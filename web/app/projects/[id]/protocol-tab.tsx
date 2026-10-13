"use client";
import { useMemo, useState, type ReactNode } from "react";
import { FIELD_NAMES, parseCodes, RULE_LABELS } from "@/lib/criteria";
import { EXAMPLE_PROTOCOL, migrateProtocol } from "@/lib/defaults";
import { download } from "@/lib/download";
import { buildStrings, termsOf } from "@/lib/protocol";
import { buildDocx, docMD, docModel, docText, protocolChecklist, slug, type DocNode, type ListItem, type Run } from "@/lib/protocol-doc";
import { critKind } from "@/lib/screening";
import { SOURCE_LABELS, type Criterion, type Field, type Protocol } from "@/lib/types";
import { getPath, setPath, useB } from "./store";

const BLOCK_COLORS = ["var(--hl1)", "var(--hl2)", "var(--hl3)", "var(--hl4)"];
const fmtN = (n: number) => n.toLocaleString("pt-BR");
const today = () => new Date().toISOString().slice(0, 10);
function fmtDate(iso?: string) {
  const d = iso ? new Date(iso) : null;
  return d && !isNaN(+d) ? d.toLocaleDateString("pt-BR") + " às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
}

/** Campos ligados a um caminho do protocolo, como "sqs.0.label". */
function useField() {
  const { protocol, updateProtocol, canWrite } = useB();
  const set = (path: string, v: unknown) => updateProtocol((p) => setPath(p, path, v));
  const text = (path: string) => ({ value: String(getPath(protocol, path) ?? ""), disabled: !canWrite, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(path, e.target.value) });
  const check = (path: string) => ({ type: "checkbox" as const, checked: !!getPath(protocol, path), disabled: !canWrite, onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(path, e.target.checked) });
  return { text, check };
}

export default function ProtocolTab({ goTab }: { goTab: (tab: "prisma") => void }) {
  const { protocol: p } = useB();
  const [mode, setMode] = useState<"edit" | "doc">("edit");
  return (
    <section className="stack">
      <div className="seg" role="group" aria-label="Modo do protocolo">
        <button aria-pressed={mode === "edit"} onClick={() => setMode("edit")}>Editar</button>
        <button aria-pressed={mode === "doc"} onClick={() => setMode("doc")}>Ver documento</button>
        <span className="note">{p.updatedAt ? "Última alteração em " + fmtDate(p.updatedAt) : ""}</span>
      </div>
      {mode === "edit" ? <div className="cols"><ProtocolForm /><aside className="stack sticky"><Checklist goTab={goTab} /><Strings /><Exports /></aside></div> : <DocView />}
    </section>
  );
}

type ListKey = "sqs" | "blocks" | "ic" | "ec" | "qa" | "sources";

function Add({ list, children }: { list: ListKey; children: ReactNode }) {
  const { updateProtocol, canWrite } = useB();
  const add = () => updateProtocol((d) => {
    const n = (d[list]?.length ?? 0) + 1;
    if (list === "sqs") (d.sqs ??= []).push({ id: "SQ" + n, label: "", en: "", pt: "" });
    else if (list === "blocks") (d.blocks ??= []).push({ name: "", terms: "" });
    else if (list === "sources") (d.sources ??= []).push({ id: "other", role: "main", how: "manual", date: "", reported: "", custom: "" });
    else (d[list] ??= []).push({ c: list.toUpperCase() + n, t: "" });
  });
  return <div className="row"><button className="btn ghost small" disabled={!canWrite} onClick={add}>{children}</button></div>;
}

function Rm({ list, i, label, x }: { list: ListKey; i: number; label: string; x?: boolean }) {
  const { updateProtocol, canWrite } = useB();
  return <button className="btn danger small" style={x ? undefined : { alignSelf: "flex-end" }} aria-label={label} disabled={!canWrite} onClick={() => updateProtocol((d) => { (d[list] as unknown[]).splice(i, 1); })}>{x ? "×" : "Remover"}</button>;
}

function ProtocolForm() {
  const { protocol: p, updateProtocol, canWrite } = useB();
  const { text, check } = useField();
  const empty = !p.title && !(p.blocks || []).some((b) => termsOf(b).length);

  return (
    <div className="stack">
      {empty && canWrite && (
        <div className="callout warn">Ainda sem protocolo? <button className="link" onClick={() => updateProtocol((d) => { Object.assign(d, migrateProtocol(structuredClone(EXAMPLE_PROTOCOL))); })}>Carregar um protocolo de exemplo</button> e editar à vontade.</div>
      )}
      <div className="panel">
        <header><h2>Identificação e objetivo</h2></header>
        <label className="f">Título da revisão<input type="text" {...text("title")} placeholder="Ex.: Artificial Intelligence Applied to Entrepreneurial Education: A Systematic Literature Review" /></label>
        <label className="f">Objetivo<textarea rows={3} {...text("objective")} placeholder="O objetivo desta revisão é mapear como…" /></label>
        <label className="f">Lógica da revisão (opcional, aparece em destaque no documento)<input type="text" {...text("logic")} placeholder="Ex.: Competência → Evidências → Fontes de Dados → Método de IA → Finalidade" /></label>
      </div>

      <div className="panel" id="sec-questoes">
        <header><h2>Questões de pesquisa</h2><p>A questão geral orienta a busca e a triagem; as secundárias viram as colunas da extração de dados.</p></header>
        <label className="f">Frase de abertura da tabela<input type="text" {...text("rqIntro")} /></label>
        <div className="rq gq">
          <div className="rq-id">GQ</div>
          <div className="rq-body">
            <label className="f">Rótulo<input type="text" {...text("gq.label")} placeholder="General Question" /></label>
            <label className="f">Questão (inglês)<textarea rows={2} {...text("gq.en")} placeholder="How has … been applied in …?" /></label>
            <label className="f">Questão (português)<textarea rows={2} {...text("gq.pt")} placeholder="Como … tem sido aplicada em …?" /></label>
          </div>
        </div>
        {(p.sqs || []).map((s, i) => {
          const n = parseCodes(s.codes).length;
          return (
            <div className="rq" key={i}>
              <div className="rq-id"><input type="text" aria-label="Identificador" {...text(`sqs.${i}.id`)} placeholder={"SQ" + (i + 1)} /></div>
              <div className="rq-body">
                <div className="row" style={{ flexWrap: "nowrap" }}><label className="f" style={{ flex: 1 }}>Rótulo<input type="text" {...text(`sqs.${i}.label`)} placeholder="Ex.: Data Sources" /></label><Rm list="sqs" i={i} label="Remover questão" /></div>
                <label className="f">Questão (inglês)<textarea rows={2} {...text(`sqs.${i}.en`)} placeholder="What … ?" /></label>
                <label className="f">Questão (português)<textarea rows={2} {...text(`sqs.${i}.pt`)} placeholder="Quais … ?" /></label>
                <label className="f">Livro de códigos: uma categoria por linha, no formato Categoria: termo; termo<textarea rows={4} {...text(`sqs.${i}.codes`)} placeholder={"Machine learning: machine learning; random forest; svm\nNLP: natural language processing; text mining"} /></label>
                <span className="note">{n} categoria{n === 1 ? "" : "s"}. As sugestões da extração vêm destes termos.</span>
              </div>
            </div>
          );
        })}
        <Add list="sqs">Adicionar questão secundária</Add>
      </div>

      <div className="panel">
        <header><h2>Estratégia de busca</h2><p>Cada bloco é um termo principal com seus termos alternativos (OR). Os blocos se combinam com AND. Use * para truncar, como em <span className="mono">competenc*</span>.</p></header>
        <label className="f">Texto de apresentação da string<textarea rows={2} {...text("searchIntro")} /></label>
        <div className="blocks">
          {(p.blocks || []).map((b, i) => {
            const n = termsOf(b).length;
            return (
              <div key={i} className="blocks">
                {i > 0 && <div className="and">AND</div>}
                <div className="block">
                  <div className="sw" style={{ background: BLOCK_COLORS[i % 4] }}>{i + 1}</div>
                  <div className="body">
                    <div className="row" style={{ flexWrap: "nowrap" }}><label className="f" style={{ flex: 1 }}>Termo principal (major term)<input type="text" {...text(`blocks.${i}.name`)} placeholder="Ex.: Entrepreneurial Education" /></label><Rm list="blocks" i={i} label="Remover bloco" /></div>
                    <label className="f">Termos alternativos, um por linha<textarea rows={5} {...text(`blocks.${i}.terms`)} placeholder={"entrepreneurial competenc*\nentrepreneurship education"} /></label>
                    <span className="note">{n} termo{n === 1 ? "" : "s"} combinados com OR</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <Add list="blocks">Adicionar bloco</Add>
        <div className="grid2">
          <fieldset className="fs"><legend>Campos de busca</legend>
            <label className="check"><input {...check("fields.title")} /><span>Título</span></label>
            <label className="check"><input {...check("fields.abstract")} /><span>Resumo</span></label>
            <label className="check"><input {...check("fields.keywords")} /><span>Palavras-chave</span></label>
          </fieldset>
          <fieldset className="fs"><legend>Tipos de documento</legend>
            <label className="check"><input {...check("docTypes.journal")} /><span>Artigos de periódico</span></label>
            <label className="check"><input {...check("docTypes.conference")} /><span>Artigos de conferência</span></label>
          </fieldset>
        </div>
        <label className="f">Justificativa dos tipos de documento<textarea rows={2} {...text("docTypesText")} /></label>
        <div className="grid2">
          <label className="f">Ano inicial (vazio = sem limite)<input type="number" {...text("yearFrom")} placeholder="Ex.: 2016" /></label>
          <label className="f">Ano final (vazio = até a data da busca)<input type="number" {...text("yearTo")} /></label>
          <label className="f" id="sec-idioma">Idiomas aceitos<input type="text" {...text("langs")} placeholder="English" /></label>
        </div>
        <label className="f" id="sec-recorte">Justificativa do recorte temporal<textarea rows={2} {...text("yearText")} placeholder="Ex.: a partir de 2023, quando a IA generativa passou a ser usada em larga escala no ensino; ou sem corte, para mapear toda a produção" /></label>
        <label className="f">Justificativa do idioma (opcional)<textarea rows={2} {...text("langsText")} placeholder="Ex.: inglês é o idioma predominante das publicações indexadas nas bases escolhidas" /></label>
      </div>

      <div className="panel" id="sec-criterios">
        <header><h2>Critérios de elegibilidade</h2><p>Os códigos EC viram os motivos de exclusão na triagem e no fluxograma.</p></header>
        {(["ic", "ec"] as const).map((k) => (
          <div className="stack" style={{ gap: 8 }} key={k}>
            <h3>{k === "ic" ? "Inclusão" : "Exclusão"}</h3>
            {(p[k] || []).map((c, i) => (
              <div className="crit-wrap" key={i}>
                <div className="crit"><input type="text" className="code" aria-label="Código" {...text(`${k}.${i}.c`)} /><textarea rows={2} aria-label="Descrição" {...text(`${k}.${i}.t`)} /><Rm list={k} i={i} label="Remover critério" x /></div>
                <RuleEditor kind={k} i={i} c={c} />
              </div>
            ))}
            <Add list={k}>Adicionar critério de {k === "ic" ? "inclusão" : "exclusão"}</Add>
          </div>
        ))}
      </div>

      <div className="panel">
        <header><h2>Fontes de informação</h2><p>Bases principais entram na busca; complementares servem, por exemplo, para medir sobreposição. Scopus e IEEE Xplore podem ser buscadas por API na aba Busca e importação.</p></header>
        <div className="src src-head"><span>Base</span><span>Papel</span><span>Acesso</span><span>Data da busca</span><span>Total</span><span></span></div>
        {(p.sources || []).map((s, i) => (
          <div className="src" key={i}>
            <select aria-label="Base" {...text(`sources.${i}.id`)}>{Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <select aria-label="Papel" {...text(`sources.${i}.role`)} value={s.role === "comp" ? "comp" : "main"}><option value="main">Principal</option><option value="comp">Complementar</option></select>
            <select aria-label="Acesso" {...text(`sources.${i}.how`)} value={s.how === "api" ? "api" : "manual"}><option value="api">API</option><option value="manual">Exportação</option></select>
            <input type="date" aria-label="Data da busca" {...text(`sources.${i}.date`)} />
            <input type="number" aria-label="Total informado pela base" placeholder="Total" {...text(`sources.${i}.reported`)} />
            <Rm list="sources" i={i} label="Remover base" x />
          </div>
        ))}
        <Add list="sources">Adicionar base</Add>
        <label className="f">Finalidade das bases complementares<input type="text" {...text("compPurpose")} placeholder="Ex.: para avaliar o índice de sobreposição" /></label>
      </div>

      <div className="panel" id="sec-triagem">
        <header><h2>Triagem e divergências</h2><p>Quem avalia os registros e o que acontece quando os revisores discordam.</p></header>
        <div className="grid2">
          <label className="f">Revisores na triagem<select {...text("reviewers")} value={String(p.reviewers) === "1" ? "1" : "2"}><option value="2">Dois revisores independentes</option><option value="1">Um revisor</option></select></label>
          <label className="check"><input {...check("blind")} /><span>Triagem cega: a decisão do outro revisor só aparece depois que você votou no mesmo registro</span></label>
        </div>
        <label className="f">Quem faz a triagem<input type="text" {...text("team")} placeholder="Ex.: a autora (Revisor 1) e o orientador (Revisor 2)" /></label>
        {String(p.reviewers) !== "1" && <label className="f">Como as divergências são resolvidas<textarea rows={2} {...text("conflicts")} /></label>}
      </div>

      <div className="panel" id="sec-qualidade">
        <header><h2>Avaliação de qualidade</h2><p>Perguntas respondidas para cada estudo incluído, com Sim (1), Parcialmente (0,5) ou Não (0). A avaliação é feita na aba Extração.</p></header>
        {(p.qa || []).map((c, i) => (
          <div className="crit" key={i}><input type="text" className="code" aria-label="Código" {...text(`qa.${i}.c`)} /><textarea rows={2} aria-label="Critério de qualidade" {...text(`qa.${i}.t`)} placeholder="Ex.: Os objetivos do estudo estão claramente descritos?" /><Rm list="qa" i={i} label="Remover critério de qualidade" x /></div>
        ))}
        <Add list="qa">Adicionar critério de qualidade</Add>
      </div>

      <div className="panel">
        <header><h2>Etapas de seleção e extração</h2><p>Uma etapa por linha. Linhas que começam com número viram lista numerada no documento. O formulário de extração tem um campo para cada questão secundária cadastrada acima.</p></header>
        <textarea rows={8} aria-label="Etapas de seleção e extração" {...text("selection")} />
      </div>

      <div className="panel">
        <header><h2>Filtros automáticos</h2><p>Aplicados antes da triagem. Aparecem no fluxograma como removidos por ferramenta automática.</p></header>
        <label className="f">Tipos de documento excluídos automaticamente (separados por vírgula)<textarea {...text("excludedTypes")} /></label>
        <div className="grid2">
          <label className="check"><input {...check("suspectTitles")} /><span>Excluir títulos de errata, editorial, prefácio, índice e similares</span></label>
          <label className="check"><input {...check("langFilter")} /><span>Excluir idioma fora da lista (quando a base informa o idioma)</span></label>
          <label className="f">Excluir artigos com até N páginas (0 desliga)<input type="number" min={0} {...text("shortPages")} /></label>
        </div>
      </div>
    </div>
  );
}

function RuleEditor({ kind, i, c }: { kind: "ic" | "ec"; i: number; c: Criterion }) {
  const { protocol: p, F, updateProtocol } = useB();
  const { text, check } = useField();
  const r = c.rule ?? { type: "none" as const };
  const type = r.type || "none";
  const [open, setOpen] = useState(type !== "none");
  const base = `${kind}.${i}.rule`;
  const stats = useMemo(() => {
    if (!c.c || type === "none" || !F.screen.length) return null;
    let y = 0, n = 0, u = 0, any = false;
    for (const rec of F.screen) { const e = F.crit[rec.key]?.[c.c]; if (!e) continue; any = true; if (e.v === "y") y++; else if (e.v === "n") n++; else u++; }
    return any ? { y, n, u } : null;
  }, [F, c.c, type]);
  // sem o objeto fields, os três campos valem
  const fields = (["title", "abstract", "keywords"] as Field[]).map((f) => {
    const { checked, ...rest } = check(`${base}.fields.${f}`);
    return <label className="check" key={f}><input {...rest} checked={r.fields ? checked : true} onChange={(e) => { if (!r.fields) setAll(f, e.target.checked); else rest.onChange(e); }} /><span>{FIELD_NAMES[f]}</span></label>;
  });
  function setAll(f: Field, on: boolean) { updateProtocol((d) => setPath(d, `${base}.fields`, { title: true, abstract: true, keywords: true, [f]: on })); }
  const how = kind === "ic" ? "Atende quando" : "Se aplica quando";
  const expl: Record<string, string> = {
    none: "", year: kind === "ic" ? "o ano está dentro da janela do protocolo." : "o ano está fora da janela.",
    lang: kind === "ic" ? "o idioma está na lista." : "o idioma não está na lista.", doctype: kind === "ic" ? "o tipo está na lista." : "o tipo não está na lista.",
    block: "algum termo do bloco aparece nos campos marcados.", string: "todos os blocos têm algum termo nos campos marcados.", terms: "algum termo aparece nos campos marcados.",
  };
  const ic = critKind(p, c.c) === "ic";
  return (
    <details className="rule" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Verificação automática: <b>{RULE_LABELS[type]}</b>{stats && <span className="rstat"> · nos {fmtN(F.screen.length)} registros: {ic ? "atende" : "aplica"} {fmtN(stats.y)}, {ic ? "não atende" : "não aplica"} {fmtN(stats.n)}, indeterminado {fmtN(stats.u)}</span>}</summary>
      <div className="rule-body">
        <label className="f">Tipo de regra<select {...text(`${base}.type`)} value={type}>{Object.entries(RULE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        {type === "terms" && <><label className="f">Termos, um por linha (use * para truncar)<textarea rows={3} {...text(`${base}.terms`)} /></label><div className="row">{fields}</div></>}
        {type === "block" && <><label className="f">Bloco<select {...text(`${base}.block`)} value={String(Number(r.block) || 0)}>{(p.blocks || []).map((b, j) => <option key={j} value={j}>{j + 1}. {b.name || "Bloco " + (j + 1)}</option>)}</select></label><div className="row">{fields}</div></>}
        {type === "string" && <div className="row">{fields}</div>}
        {type === "lang" && <label className="f">Idiomas aceitos (vazio = os do protocolo)<input type="text" {...text(`${base}.values`)} placeholder={p.langs || "English"} /></label>}
        {type === "doctype" && <label className="f">Tipos aceitos, separados por vírgula<input type="text" {...text(`${base}.values`)} placeholder="article, journal, conference, inproceedings, proceedings paper" /></label>}
        <p className="note">{expl[type] ? `${how} ${expl[type]} Sem dados suficientes, fica indeterminado.` : "Sem regra: o revisor responde este critério manualmente."}</p>
      </div>
    </details>
  );
}

function Strings() {
  const { protocol: p, updateProtocol, canWrite, toast } = useB();
  const [editing, setEditing] = useState<string | null>(null);
  const strs = useMemo(() => buildStrings(p, true), [p]);
  const setCustom = (id: string, v: string) => updateProtocol((d) => { const s = d.sources?.find((x) => x.id === id); if (s) s.custom = v; });
  return (
    <div className="panel">
      <header><h2>String por base</h2></header>
      <p className="note">Montada a partir dos blocos, dos campos, dos anos, do idioma e dos tipos de documento, na sintaxe de cada base. Para ajustar uma delas à mão, use Editar.</p>
      <div className="strings">
        {strs.length ? strs.map((s) => (
          <div className="string" key={s.id}>
            <div className="h">
              <span>{s.label}{s.role === "comp" && <> <span className="pill pend">complementar</span></>}{s.custom && <> <span className="pill may">editada</span></>}</span>
              <span className="row" style={{ gap: 8 }}>
                {s.id !== "generic" && canWrite && <button className="link" onClick={() => setEditing(editing === s.id ? null : s.id)}>{editing === s.id ? "Concluir" : "Editar"}</button>}
                {s.custom && canWrite && <button className="link" onClick={() => { setCustom(s.id, ""); setEditing(null); }}>Restaurar</button>}
                <button className="link" onClick={() => copyText(s.s, toast)}>Copiar</button>
              </span>
            </div>
            {editing === s.id
              ? <textarea className="strta" rows={7} autoFocus aria-label={"String para " + s.label} value={s.s} onChange={(e) => setCustom(s.id, e.target.value.trim() === s.auto ? "" : e.target.value)} />
              : <pre>{s.s}</pre>}
            {s.notes.length > 0 && <div className="note" style={{ padding: "0 10px 8px" }}>{s.notes.join(" ")}</div>}
          </div>
        )) : <div className="empty"><b>Nenhum termo ainda</b>Preencha os blocos da estratégia de busca para montar as strings.</div>}
      </div>
    </div>
  );
}

async function copyText(t: string, toast: (m: string) => void) {
  try { await navigator.clipboard.writeText(t); toast("Copiado."); }
  catch { toast("Não foi possível copiar. Selecione o texto e copie manualmente."); }
}

function useExports() {
  const { protocol: p, toast } = useB();
  const name = (ext: string) => `protocolo_${slug(p.title || "").slice(0, 60)}_${today()}.${ext}`;
  return {
    md: () => download(name("md"), docMD(docModel(p)), "text/markdown"),
    json: () => download("protocolo.json", JSON.stringify({ ...p, _gerado: "Bancada PRISMA, " + new Date().toISOString() }, null, 2), "application/json"),
    copy: () => copyText(docText(docModel(p)), toast),
    docx: async () => {
      try { const D = await import("docx"); download(name("docx"), await D.Packer.toBlob(buildDocx(D, docModel(p)))); }
      catch { toast("Não foi possível gerar o Word agora. Baixe em Markdown ou copie o texto."); }
    },
  };
}

/** Rola até a seção do formulário e põe o cursor no primeiro campo dela. */
function goToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
  el.classList.remove("flash");
  void el.offsetWidth; // reinicia a animação se a seção já estava marcada
  el.classList.add("flash");
  const field = el.matches("input,textarea,select") ? el : el.querySelector<HTMLElement>("input:not([type=checkbox]),textarea,select");
  field?.focus({ preventScroll: true });
}

function Checklist({ goTab }: { goTab: (tab: "prisma") => void }) {
  const { protocol: p } = useB();
  const items = protocolChecklist(p);
  return (
    <div className="panel">
      <header><h2>O que o protocolo precisa ter</h2><span className="note mono">{items.filter((x) => x.ok).length}/{items.length}</span></header>
      <ul className="chk">
        {items.map((x) => (
          <li key={x.label} className={x.ok ? "ok" : "todo"}><span aria-hidden="true">{x.ok ? "✓" : "○"}</span>
            <button className="chk-go" onClick={() => (x.target.startsWith("tab:") ? goTab(x.target.slice(4) as "prisma") : goToSection(x.target))}><b>{x.label}</b>{x.hint && <span className="note">{x.hint}</span>}</button></li>
        ))}
      </ul>
    </div>
  );
}

function Exports() {
  const x = useExports();
  return (
    <div className="panel">
      <header><h2>Documento</h2></header>
      <div className="row"><button className="btn" onClick={x.docx}>Baixar protocolo (.docx)</button><button className="btn ghost" onClick={x.md}>Markdown</button></div>
      <p className="note">O <span className="mono">protocolo.json</span> guarda tudo o que está nesta aba e serve para criar outra revisão a partir desta.</p>
      <div className="row"><button className="btn ghost" onClick={x.json}>protocolo.json</button></div>
    </div>
  );
}

function DocView() {
  const { protocol: p } = useB();
  const x = useExports();
  const M = useMemo(() => docModel(p), [p]);
  return (
    <div>
      <div className="row" style={{ justifyContent: "flex-end", marginBottom: 12 }}>
        <button className="btn" onClick={x.docx}>Baixar Word (.docx)</button><button className="btn ghost" onClick={x.md}>Markdown</button><button className="btn ghost" onClick={x.copy}>Copiar texto</button>
      </div>
      <article className="sheet">{M.map((n, i) => <DocBlock key={i} n={n} />)}</article>
    </div>
  );
}

const Runs = ({ runs }: { runs: Run[] }) => <>{runs.map((r, i) => { let el: ReactNode = r.text; if (r.i) el = <em>{el}</em>; if (r.b) el = <strong>{el}</strong>; return <span key={i}>{el}</span>; })}</>;
const Li = ({ it }: { it: ListItem }) => <li><Runs runs={it.runs} />{it.children?.length ? <ul>{it.children.map((c, i) => <Li key={i} it={c} />)}</ul> : null}</li>;

function DocBlock({ n }: { n: DocNode }) {
  switch (n.t) {
    case "title": return <h1>{n.text}</h1>;
    case "h": return <h2>{n.text}</h2>;
    case "h2": return <h3>{n.text}</h3>;
    case "p": return <p><Runs runs={n.runs} /></p>;
    case "small": return <p className="small">{n.text}</p>;
    case "code": return <pre>{n.text}</pre>;
    case "meta": return <p className="meta">{n.text}</p>;
    case "ul": return <ul>{n.items.map((it, i) => <Li key={i} it={it} />)}</ul>;
    case "ol": return <ol>{n.items.map((it, i) => <Li key={i} it={it} />)}</ol>;
    case "table": return (
      <div className="tw"><table>
        <colgroup>{n.widths.map((w, i) => <col key={i} style={{ width: w + "%" }} />)}</colgroup>
        <thead><tr>{n.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{n.rows.map((r, i) => <tr key={i}>{r.map((cell, j) => <td key={j}>{cell.map((pp, k) => <p key={k}><Runs runs={pp} /></p>)}</td>)}</tr>)}</tbody>
      </table></div>
    );
  }
}
