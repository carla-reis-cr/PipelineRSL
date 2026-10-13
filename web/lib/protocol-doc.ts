/**
 * Documento do protocolo: um modelo único (lista de blocos) que alimenta a
 * visualização na tela, o Markdown, o texto puro e o arquivo Word.
 */
import type * as Docx from "docx";
import { FIELD_NAMES, parseCodes, ruleFields } from "./criteria";
import { fieldList, fieldsLabel, intOr, quote, termsOf } from "./protocol";
import { SOURCE_LABELS, type Criterion, type Protocol } from "./types";

export interface Run { text: string; b?: boolean; i?: boolean }
export interface ListItem { runs: Run[]; children?: ListItem[] }
export type DocNode =
  | { t: "title" | "h" | "h2" | "small" | "code" | "meta"; text: string }
  | { t: "p"; runs: Run[] }
  | { t: "ul" | "ol"; items: ListItem[] }
  | { t: "table"; widths: number[]; head: string[]; rows: Run[][][][] }; // linha > célula > parágrafo > trechos

const R = (text: unknown, o: Omit<Run, "text"> = {}): Run => ({ text: String(text ?? ""), ...o });
const fmtN = (n: number | null) => Number(n || 0).toLocaleString("pt-BR");
const joinPt = (list: string[]) => { list = list.filter(Boolean); return list.length > 1 ? list.slice(0, -1).join(", ") + " e " + list[list.length - 1] : list[0] || ""; };
const paras = (text?: string) => String(text || "").split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
const srcName = (id: string) => SOURCE_LABELS[id as keyof typeof SOURCE_LABELS] ?? id;

export function docModel(p: Protocol): DocNode[] {
  const M: DocNode[] = [];
  M.push({ t: "title", text: "Protocolo de Revisão da Literatura" });
  M.push({ t: "p", runs: [R("Título: ", { b: true }), R(p.title || "(sem título)", { i: true })] });

  M.push({ t: "h", text: "1. Objetivos e Questões de Pesquisa (Research Questions)" });
  paras(p.objective).forEach((x) => M.push({ t: "p", runs: [R(x)] }));
  if ((p.logic || "").trim()) { M.push({ t: "p", runs: [R("A ideia é seguir a lógica:")] }); M.push({ t: "p", runs: [R(p.logic!.trim(), { b: true })] }); }
  if ((p.rqIntro || "").trim()) M.push({ t: "p", runs: [R(p.rqIntro!.trim())] });
  const qcell = (label?: string, en?: string, pt?: string) => [label ? [R(label, { b: true })] : null, en ? [R(en)] : null, pt ? [R("(" + pt + ")", { i: true })] : null].filter(Boolean) as Run[][];
  const rows: Run[][][][] = [[[[R("GQ", { b: true })]], qcell(p.gq?.label || "General Question", p.gq?.en, p.gq?.pt)]];
  (p.sqs || []).forEach((s, i) => rows.push([[[R(s.id || "SQ" + (i + 1), { b: true })]], qcell(s.label, s.en, s.pt)]));
  M.push({ t: "table", widths: [14, 86], head: ["ID", "Questão de Pesquisa (Research Question)"], rows });

  M.push({ t: "h", text: "2. Estratégia de Busca (Search String)" });
  paras(p.searchIntro).forEach((x) => M.push({ t: "p", runs: [R(x)] }));
  const B = (p.blocks || []).filter((b) => termsOf(b).length);
  if (B.length) {
    M.push({ t: "p", runs: [R("Estrutura da String:", { b: true })] });
    M.push({ t: "table", widths: [28, 72], head: ["Major terms", "Alternative terms"], rows: B.map((b, i) => [[[R(b.name || "Bloco " + (i + 1))]], [[R("( " + termsOf(b).map(quote).join(" OR ") + " )" + (i < B.length - 1 ? " AND" : ""))]]]) });
    // as strings na sintaxe de cada base ficam na aba Protocolo, não no documento
  }

  M.push({ t: "h", text: "3. Fontes de Informação e Parâmetros (Information Sources)" });
  const src = p.sources || [];
  const main = src.filter((s) => s.role !== "comp").map((s) => srcName(s.id)), comp = src.filter((s) => s.role === "comp").map((s) => srcName(s.id));
  const fsEn = { title: "Title", abstract: "Abstract", keywords: "Keywords" };
  const fl = fieldList(p);
  const items: ListItem[] = [];
  if (main.length) items.push({ runs: [R("Bases de Dados Selecionadas: ", { b: true }), R(joinPt(main) + ".")] });
  if (comp.length) items.push({ runs: [R("Bases de Dados Complementares: ", { b: true }), R(joinPt(comp) + ((p.compPurpose || "").trim() ? " " + p.compPurpose!.trim().replace(/\.$/, "") : "") + ".")] });
  items.push({ runs: [R("Campos de Busca: ", { b: true }), R(fieldsLabel(p) + " ("), R(fl.map((f) => fsEn[f]).join(", ").replace(/, ([^,]+)$/, " and $1"), { i: true }), R(").")] });
  if ((p.docTypesText || "").trim()) items.push({ runs: [R("Tipo de Documento: ", { b: true }), R(p.docTypesText!.trim())] });
  const yf = intOr(p.yearFrom), yt = intOr(p.yearTo);
  const why = (t?: string) => ((t || "").trim() ? " " + t!.trim().replace(/\.?$/, ".") : "");
  items.push({ runs: [R("Recorte temporal: ", { b: true }), R((yf && yt ? `de ${yf} a ${yt}.` : yf ? `de ${yf} até a data da busca.` : yt ? `até ${yt}.` : "sem limite de ano.") + why(p.yearText))] });
  if ((p.langs || "").trim()) items.push({ runs: [R("Idioma dos estudos: ", { b: true }), R(p.langs!.trim() + "." + why(p.langsText))] });
  const dated = src.filter((s) => s.date || s.reported);
  if (dated.length) items.push({ runs: [R("Execução da busca: ", { b: true }), R(dated.map((s) => srcName(s.id) + (s.date ? " em " + new Date(s.date + "T12:00").toLocaleDateString("pt-BR") : "") + (s.reported ? " (" + fmtN(intOr(s.reported)) + " registros)" : "")).join("; ") + ".")] });
  M.push({ t: "ul", items });

  M.push({ t: "h", text: "4. Critérios de Elegibilidade (Eligibility Criteria)" });
  const ruleDesc = (c: Criterion) => {
    const r = c.rule;
    if (!r || !r.type || r.type === "none") return "";
    const fs = ruleFields(r).map((f) => FIELD_NAMES[f]).join(", ");
    const d: Record<string, string> = {
      year: "ano dentro da janela", lang: "idioma aceito", doctype: "tipo de documento (" + (r.values || "artigo de periódico ou conferência") + ")",
      block: "termos do bloco “" + ((p.blocks || [])[Number(r.block) || 0]?.name || "") + "” em " + fs,
      string: "todos os blocos da string em " + fs,
      terms: "termos (" + (r.terms || "").split(/\n|;/).map((s) => s.trim()).filter(Boolean).slice(0, 6).join(", ") + ") em " + fs,
    };
    return d[r.type] ? " Pré-avaliação automática: " + d[r.type] + "." : "";
  };
  const crit = (list?: Criterion[]): ListItem[] => (list || []).filter((c) => c.c || c.t).map((c) => ({ runs: [R("(" + c.c + "): ", { b: true }), R(c.t), R(ruleDesc(c), { i: true })] }));
  M.push({ t: "ul", items: [{ runs: [R("Critérios de Inclusão (IC):", { b: true })], children: crit(p.ic) }, { runs: [R("Critérios de Exclusão (EC):", { b: true })], children: crit(p.ec) }] });

  M.push({ t: "h", text: "5. Seleção, Qualidade e Extração de Dados" });
  const two = String(p.reviewers) !== "1";
  M.push({ t: "h2", text: "5.1 Triagem e resolução de divergências" });
  M.push({ t: "p", runs: [R("Quem faz a triagem: ", { b: true }), R(((p.team || "").trim() ? p.team!.trim().replace(/\.?$/, ". ") : "") + (two ? `Dois revisores avaliam cada registro de forma independente${p.blind !== false ? ", sem ver a decisão um do outro (triagem cega)" : ""}, nas etapas de título/resumo e de texto completo.` : "Um revisor avalia cada registro, nas etapas de título/resumo e de texto completo."))] });
  if (two && (p.conflicts || "").trim()) M.push({ t: "p", runs: [R("Divergências: ", { b: true }), R(p.conflicts!.trim())] });
  M.push({ t: "h2", text: "5.2 Etapas" });
  let ol: { t: "ol"; items: ListItem[] } | null = null;
  String(p.selection || "").split(/\n/).map((s) => s.trim()).filter(Boolean).forEach((line) => {
    const m = line.match(/^\d+[.)]\s*(.*)$/);
    const runsOf = (txt: string) => { const c = txt.match(/^([^:]{2,70}):\s*(.*)$/); return c ? [R(c[1] + ": ", { b: true }), R(c[2])] : [R(txt)]; };
    if (m) { if (!ol) { ol = { t: "ol", items: [] }; M.push(ol); } ol.items.push({ runs: runsOf(m[1]) }); }
    else { ol = null; M.push({ t: "p", runs: runsOf(line) }); }
  });
  M.push({ t: "h2", text: "5.3 Avaliação de qualidade dos estudos" });
  const qa = (p.qa || []).filter((c) => (c.t || "").trim());
  if (qa.length) {
    M.push({ t: "p", runs: [R("Cada estudo incluído é avaliado pelos critérios abaixo, com resposta Sim (1), Parcialmente (0,5) ou Não (0). A soma compõe a pontuação de qualidade do estudo.")] });
    M.push({ t: "ul", items: qa.map((c) => ({ runs: [R("(" + c.c + "): ", { b: true }), R(c.t)] })) });
  } else M.push({ t: "p", runs: [R("Critérios de avaliação de qualidade ainda não definidos.", { i: true })] });

  M.push({ t: "h2", text: "5.4 Formulário de extração" });
  const sqs = p.sqs || [];
  if (sqs.length) {
    M.push({ t: "p", runs: [R("O formulário tem um campo para cada questão de pesquisa secundária. Quando há categorias previstas (livro de códigos), a ferramenta as sugere a partir de título, resumo e palavras-chave, e o revisor aceita, recusa ou acrescenta categorias e registra o trecho que sustenta a codificação.")] });
    M.push({ t: "table", widths: [14, 40, 46], head: ["Campo", "Questão respondida", "Categorias previstas (termos indicadores)"], rows: sqs.map((s, i) => {
      const codes = parseCodes(s.codes);
      return [[[R(s.id || "SQ" + (i + 1), { b: true })], ...(s.label ? [[R(s.label)]] : [])], [[R(s.en || s.pt || "")], ...(s.en && s.pt ? [[R("(" + s.pt + ")", { i: true })]] : [])], codes.length ? codes.map((c) => [R(c.cat + ": ", { b: true }), R(c.terms.join("; "))]) : [[R("Campo aberto", { i: true })]]];
    }) });
  } else M.push({ t: "p", runs: [R("Questões secundárias ainda não definidas; o formulário terá um campo para cada uma.", { i: true })] });

  M.push({ t: "h2", text: "5.5 Fluxograma PRISMA 2020" });
  M.push({ t: "p", runs: [R("O processo de seleção será relatado no fluxograma PRISMA 2020, com o número de registros em cada etapa: identificados por base, duplicados removidos, removidos por filtros automáticos, triados, excluídos na triagem, buscados e não recuperados, avaliados no texto completo, excluídos com o motivo (critério) e incluídos na revisão.")] });
  M.push({ t: "meta", text: "Versão de " + (p.updatedAt ? new Date(p.updatedAt) : new Date()).toLocaleDateString("pt-BR") + ", gerada pela Bancada PRISMA." });
  return M;
}

/* ---------- Markdown e texto ---------- */
function runsMD(runs: Run[]) {
  return runs.map((r) => {
    let t = r.text;
    if (!t.trim()) return t;
    const lead = t.match(/^\s*/)![0], trail = t.match(/\s*$/)![0];
    t = t.trim();
    if (r.i) t = "*" + t + "*";
    if (r.b) t = "**" + t + "**";
    return lead + t + trail;
  }).join("");
}

export function docMD(M: DocNode[]): string {
  const li = (it: ListItem, d = 0, n?: number): string => "  ".repeat(d) + (n ? n + ". " : "- ") + runsMD(it.runs) + (it.children || []).map((c) => "\n" + li(c, d + 1)).join("");
  return M.map((n) => {
    switch (n.t) {
      case "title": return "# " + n.text;
      case "h": return "## " + n.text;
      case "h2": return "### " + n.text;
      case "p": return runsMD(n.runs);
      case "small": return "*" + n.text + "*";
      case "meta": return "---\n*" + n.text + "*";
      case "code": return "```\n" + n.text + "\n```";
      case "ul": return n.items.map((it) => li(it)).join("\n");
      case "ol": return n.items.map((it, i) => li(it, 0, i + 1)).join("\n");
      case "table": return "| " + n.head.join(" | ") + " |\n|" + n.head.map(() => "---").join("|") + "|\n" + n.rows.map((r) => "| " + r.map((cell) => cell.map(runsMD).join("<br>").replace(/\|/g, "\\|")).join(" | ") + " |").join("\n");
    }
  }).join("\n\n") + "\n";
}

export function docText(M: DocNode[]): string {
  const rt = (runs: Run[]) => runs.map((r) => r.text).join("");
  const li = (it: ListItem, d = 0, n?: number): string => "   ".repeat(d) + (n ? n + ". " : "• ") + rt(it.runs) + (it.children || []).map((c) => "\n" + li(c, d + 1)).join("");
  return M.map((n) => {
    switch (n.t) {
      case "p": return rt(n.runs);
      case "ul": return n.items.map((it) => li(it)).join("\n");
      case "ol": return n.items.map((it, i) => li(it, 0, i + 1)).join("\n");
      case "table": return [n.head.join("\t"), ...n.rows.map((r) => r.map((cell) => cell.map(rt).join(" ")).join("\t"))].join("\n");
      default: return n.text;
    }
  }).join("\n\n");
}

/* ---------- Word ---------- */
export function buildDocx(D: typeof Docx, M: DocNode[]): Docx.Document {
  const FONT = "Arial";
  const tr = (r: Run) => new D.TextRun({ text: r.text, bold: !!r.b, italics: !!r.i, font: FONT, size: 22 });
  const border = { style: D.BorderStyle.SINGLE, size: 4, color: "000000" };
  const borders = { top: border, bottom: border, left: border, right: border };
  const codeBorder = { style: D.BorderStyle.SINGLE, size: 2, color: "CCCCCC", space: 4 };
  const children: (Docx.Paragraph | Docx.Table)[] = [];
  let olInst = 0;
  const listItems = (items: ListItem[], reference: string, level: number, instance?: number) => {
    for (const it of items) {
      children.push(new D.Paragraph({ children: it.runs.map(tr), numbering: { reference, level, ...(instance != null ? { instance } : {}) }, spacing: { after: 80, line: 276 } }));
      if (it.children?.length) listItems(it.children, reference, level + 1, instance);
    }
  };
  const heading = (text: string, size: number, spacing: { before?: number; after: number }) => new D.Paragraph({ children: [new D.TextRun({ text, bold: true, font: FONT, size })], spacing });
  for (const n of M) {
    if (n.t === "title") children.push(heading(n.text, 26, { after: 320 }));
    else if (n.t === "h") children.push(heading(n.text, 22, { before: 320, after: 120 }));
    else if (n.t === "h2") children.push(heading(n.text, 22, { before: 200, after: 100 }));
    else if (n.t === "p") children.push(new D.Paragraph({ children: n.runs.map(tr), spacing: { after: 120, line: 276 }, alignment: D.AlignmentType.JUSTIFIED }));
    else if (n.t === "small") children.push(new D.Paragraph({ children: [new D.TextRun({ text: n.text, italics: true, font: FONT, size: 18, color: "555555" })], spacing: { after: 160 } }));
    else if (n.t === "meta") children.push(new D.Paragraph({ children: [new D.TextRun({ text: n.text, italics: true, font: FONT, size: 18, color: "777777" })], spacing: { before: 400 } }));
    else if (n.t === "code") children.push(new D.Paragraph({ children: [new D.TextRun({ text: n.text, font: "Courier New", size: 18 })], shading: { type: D.ShadingType.CLEAR, fill: "F2F2F2", color: "auto" }, border: { top: codeBorder, bottom: codeBorder, left: codeBorder, right: codeBorder }, spacing: { after: 80 } }));
    else if (n.t === "ul") listItems(n.items, "bullets", 0);
    else if (n.t === "ol") { olInst++; listItems(n.items, "numbers", 0, olInst); }
    else if (n.t === "table") {
      const total = 9026;
      const w = n.widths.map((x) => Math.round((total * x) / 100));
      const cell = (content: Docx.Paragraph[], i: number) => new D.TableCell({ borders, width: { size: w[i], type: D.WidthType.DXA }, margins: { top: 80, bottom: 80, left: 110, right: 110 }, children: content });
      children.push(new D.Table({
        width: { size: total, type: D.WidthType.DXA }, columnWidths: w,
        rows: [
          new D.TableRow({ tableHeader: true, children: n.head.map((h, i) => cell([new D.Paragraph({ children: [new D.TextRun({ text: h, bold: true, font: FONT, size: 22 })] })], i)) }),
          ...n.rows.map((r) => new D.TableRow({ cantSplit: true, children: r.map((c, i) => cell(c.map((pp) => new D.Paragraph({ children: pp.map(tr), spacing: { after: 40 } })), i)) })),
        ],
      }));
      children.push(new D.Paragraph({ children: [], spacing: { after: 120 } }));
    }
  }
  const bullet = (level: number, text: string) => ({ level, format: D.LevelFormat.BULLET, text, alignment: D.AlignmentType.LEFT, style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } } });
  return new D.Document({
    creator: "Bancada PRISMA", title: "Protocolo de Revisão da Literatura",
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    numbering: { config: [
      { reference: "bullets", levels: [bullet(0, "●"), bullet(1, "○"), bullet(2, "■")] },
      { reference: "numbers", levels: [{ level: 0, format: D.LevelFormat.DECIMAL, text: "%1.", alignment: D.AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ] },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children }],
  });
}

/** O que um protocolo de revisão precisa definir; `hint` diz o que falta (ou onde o item é atendido). */
export function protocolChecklist(p: Protocol): { label: string; ok: boolean; hint: string; target: string }[] {
  const filled = (t?: unknown) => !!String(t ?? "").trim();
  const crit = (l?: Criterion[]) => (l || []).filter((c) => filled(c.c) && filled(c.t)).length;
  const sqs = p.sqs || [], asked = sqs.filter((s) => filled(s.en) || filled(s.pt)).length;
  const two = String(p.reviewers) !== "1";
  const item = (label: string, ok: boolean, missing: string, target: string, done = "") => ({ label, ok, hint: ok ? done : missing, target });
  return [
    item("Recorte temporal", filled(p.yearText), filled(p.yearFrom) || filled(p.yearTo) ? "Justifique o recorte: por que desde esse ano?" : "Defina o ano inicial, ou justifique não haver corte.", "sec-recorte"),
    item("Idioma dos estudos", filled(p.langs), "Informe os idiomas aceitos.", "sec-idioma"),
    item("Critérios de inclusão e exclusão numerados", crit(p.ic) > 0 && crit(p.ec) > 0, "Cadastre ao menos um IC e um EC, com código e descrição.", "sec-criterios"),
    item("Critérios de avaliação de qualidade", crit(p.qa) > 0, "Cadastre as perguntas de qualidade (QA1, QA2…).", "sec-qualidade"),
    item("Formulário de extração: um campo por questão", asked > 0 && asked === sqs.length, asked ? "Há questão secundária sem texto." : "Cadastre as questões secundárias; cada uma vira um campo da extração.", "sec-questoes"),
    item("Quem faz a triagem e como se resolvem divergências", filled(p.team) && (!two || filled(p.conflicts)), filled(p.team) ? "Descreva como as divergências são resolvidas." : "Informe quem faz a triagem.", "sec-triagem"),
    item("Fluxograma PRISMA 2020 com os números de cada etapa", true, "", "tab:prisma", "Abrir a aba Fluxograma PRISMA, gerado a partir das decisões."),
  ];
}

export function slug(s: string, fallback = "protocolo"): string {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || fallback;
}
