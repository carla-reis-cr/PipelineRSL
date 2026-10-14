/** Protocolo em branco, protocolo de exemplo e conversão de formatos antigos. */
import { DEFAULT_EXCLUDED_TYPES } from "./funnel";
import type { Protocol } from "./types";

export const DEFAULT_SELECTION = `1. Triagem: os registros vindos das bases (por API ou arquivo exportado) entram no Pipeline RSL, que remove duplicatas e registros inelegíveis por tipo, ano e idioma. Dois revisores leem títulos e resumos de forma independente; sugestões de IA, quando usadas, só são exibidas depois da decisão de cada revisor.
2. Leitura do texto completo: os estudos aprovados são lidos na íntegra pelos dois revisores, e cada exclusão é registrada com o critério correspondente.
3. Avaliação de qualidade: os estudos incluídos são avaliados com um checklist de qualidade definido pela equipe.
4. Extração de dados: os dados são extraídos em formulário próprio, com uma coluna para cada questão secundária.`;

export const DEFAULT_PROTOCOL: Protocol = {
  title: "", objective: "", logic: "",
  rqIntro: "As questões foram estruturadas para compor a matriz de extração do estudo:",
  gq: { label: "General Question", en: "", pt: "" },
  sqs: [{ id: "SQ1", label: "", en: "", pt: "" }],
  searchIntro: "A string foi estruturada em blocos obrigatórios de interseção (AND).",
  blocks: [{ name: "", terms: "" }, { name: "", terms: "" }],
  fields: { title: true, abstract: true, keywords: true },
  docTypes: { journal: true, conference: true },
  docTypesText: "Serão incluídos artigos de periódicos revisados por pares e trabalhos publicados em anais de conferências.",
  yearFrom: "", yearTo: "", yearText: "", langs: "English", langsText: "",
  ic: [{ c: "IC1", t: "" }], ec: [{ c: "EC1", t: "" }],
  sources: [
    { id: "scopus", role: "main", how: "api", date: "", reported: "", custom: "" },
    { id: "web_of_science", role: "main", how: "manual", date: "", reported: "", custom: "" },
    { id: "acm_dl", role: "main", how: "manual", date: "", reported: "", custom: "" },
  ],
  compPurpose: "", selection: DEFAULT_SELECTION,
  qa: [{ c: "QA1", t: "" }],
  team: "",
  conflicts: "As divergências são resolvidas por consenso entre os dois revisores; persistindo o desacordo, um terceiro revisor decide.",
  excludedTypes: DEFAULT_EXCLUDED_TYPES, suspectTitles: true, langFilter: true, shortPages: "0", reviewers: "2", blind: true, updatedAt: "",
};

const crit = (rows: [string, string][]) => rows.map(([c, t]) => ({ c, t }));

export const EXAMPLE_PROTOCOL: Protocol = {
  ...DEFAULT_PROTOCOL,
  title: "AI Agents and Agentic AI in Logistics Operations: A Systematic Literature Review and Taxonomy",
  objective: "Mapear como agentes de IA e IA agêntica têm sido aplicados em operações logísticas. (exemplo)",
  gq: { label: "General Question", en: "How have AI agents and agentic AI been applied in logistics operations?", pt: "Como agentes de IA e IA agêntica têm sido aplicados em operações logísticas?" },
  sqs: [
    { id: "SQ1", label: "Logistics tasks", en: "Which logistics tasks are supported by AI agents?", pt: "Quais tarefas logísticas são apoiadas por agentes de IA?" },
    { id: "SQ2", label: "Architectures", en: "Which agent architectures are used?", pt: "Quais arquiteturas de agentes são usadas?" },
  ],
  blocks: [
    { name: "Logistics Operations", terms: "logistics\nlogistics operations\nlogistic operations\nsupply chain\nsupply chain management\nintralogistics\nwarehouse operations\ntransportation logistics\nlast-mile delivery" },
    { name: "AI Agents and Agentic AI", terms: "AI agent\nAI agents\nagentic AI\nintelligent agent\nintelligent agents\nautonomous agent\nautonomous agents\nmulti-agent system\nmulti-agent systems\nagent-based system\nagent-based systems\nLLM agent\nLLM agents\nlarge language model agent\nlarge language model agents\ngenerative agent\ngenerative agents" },
  ],
  yearFrom: "2016",
  ic: crit([
    ["IC1", "Publicado em periódico, conferência ou workshop revisado por pares."],
    ["IC2", "Contém termos que satisfazem a string de busca definida."],
    ["IC3", "Escrito em inglês."],
    ["IC4", "Publicado entre janeiro de 2016 e a data de execução da busca."],
    ["IC5", "Aborda AI agents, agentic AI, intelligent agents, autonomous agents, multi-agent systems, LLM-based agents, generative agents ou abordagens agent-based correlatas."],
    ["IC6", "Aplica essas abordagens a operações logísticas, supply chain, intralogística, operações de armazém, transporte ou last-mile delivery."],
    ["IC7", "Aborda ao menos uma tarefa logística (planejamento, roteirização, escalonamento, previsão, otimização, coordenação, monitoramento, suporte à decisão, automação ou execução autônoma)."],
  ]),
  ec: crit([
    ["EC1", "Revisão de literatura, revisão sistemática, mapeamento sistemático, survey, revisão bibliométrica ou estudo secundário."],
    ["EC2", "Editorial, prefácio, resenha de livro, resumo de pôster, keynote ou tutorial, ou abstract curto sem conteúdo de pesquisa."],
    ["EC3", "Não relacionado a operações logísticas / supply chain / intralogística / armazém / transporte / last-mile."],
    ["EC4", "Não aborda AI agents, agentic AI, intelligent agents, autonomous agents, multi-agent systems, LLM-based agents ou abordagens agent-based correlatas."],
    ["EC5", "Aplica ML, otimização, simulação, heurísticas ou programação matemática sem componente agent-based ou agêntico."],
    ["EC6", "Usa IA generativa ou LLMs apenas como chatbot ou gerador de texto, sem comportamento agêntico."],
    ["EC7", "Usa agent-based modeling apenas para simulação descritiva, sem contribuição operacional logística."],
  ]),
  sources: [
    { id: "scopus", role: "main", how: "api", date: "", reported: "", custom: "" },
    { id: "ieee_xplore", role: "main", how: "api", date: "", reported: "", custom: "" },
    { id: "web_of_science", role: "main", how: "manual", date: "", reported: "", custom: "" },
    { id: "acm_dl", role: "main", how: "manual", date: "", reported: "", custom: "" },
  ],
  shortPages: "4",
};

/** Completa campos ausentes e converte protocolos salvos em formatos anteriores. */
export function migrateProtocol(p: (Protocol & { question?: string; objectives?: string }) | null | undefined): Protocol {
  const d = structuredClone(DEFAULT_PROTOCOL);
  const o: Protocol = { ...d, ...(p ?? {}) };
  if (p && !p.gq && p.question) o.gq = { label: "General Question", en: p.question, pt: "" };
  if (p && !p.objective && p.objectives) o.objective = p.objectives;
  o.gq = { ...d.gq, ...(o.gq ?? {}) };
  o.fields = { ...d.fields, ...(o.fields ?? {}) };
  o.docTypes = { ...d.docTypes, ...(o.docTypes ?? {}) };
  o.sqs = Array.isArray(o.sqs) ? o.sqs : [];
  o.blocks = Array.isArray(o.blocks) ? o.blocks : [];
  o.ic = Array.isArray(o.ic) ? o.ic : [];
  o.ec = Array.isArray(o.ec) ? o.ec : [];
  o.qa = Array.isArray(o.qa) ? o.qa : [];
  o.sources = (o.sources ?? []).map((s) => ({ role: "main" as const, custom: "", ...s }));
  return o;
}
