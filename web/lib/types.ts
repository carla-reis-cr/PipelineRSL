/** Identificadores das bases (mesmos rótulos source_db usados na Bancada). */
export type SourceId =
  | "scopus" | "web_of_science" | "acm_dl" | "ieee_xplore" | "springer" | "openalex"
  | "sciencedirect" | "wiley" | "taylor_francis" | "google_scholar" | "pubmed"
  | "embase" | "lilacs" | "eric" | "other";

export const SOURCE_LABELS: Record<SourceId, string> = {
  scopus: "Scopus", web_of_science: "Web of Science", acm_dl: "ACM Digital Library",
  ieee_xplore: "IEEE Xplore", springer: "SpringerLink", openalex: "OpenAlex",
  sciencedirect: "ScienceDirect", wiley: "Wiley", taylor_francis: "Taylor & Francis",
  google_scholar: "Google Scholar", pubmed: "PubMed", embase: "Embase",
  lilacs: "LILACS/BVS", eric: "ERIC", other: "Outra",
};

/** Registro bibliográfico normalizado, vindo de API ou de arquivo exportado. */
export interface BibRecord {
  source: SourceId | string;
  title: string;
  authors?: string;      // separados por "; "
  year?: number | null;
  venue?: string;
  doi?: string;
  abstract?: string;
  url?: string;
  docType?: string;      // como a base informa (Article, Conference Paper, inproceedings…)
  language?: string;
  keywords?: string;     // separadas por "; "
  pages?: number | null;
  rawId?: string;        // id nativo da base
}

/** Registro com chave estável, usado pelo funil e pela triagem. */
export interface KeyedRecord extends BibRecord {
  key: string;
}

export type Field = "title" | "abstract" | "keywords";

export interface Criterion {
  c: string;            // código: IC1, EC2…
  t: string;            // texto
  rule?: CriterionRule;
}

export type RuleType = "none" | "year" | "lang" | "doctype" | "block" | "string" | "terms";

export interface CriterionRule {
  type: RuleType;
  fields?: Partial<Record<Field, boolean>>;
  terms?: string;       // para "terms": um por linha
  block?: number | string;
  values?: string;      // para "lang" e "doctype": lista separada por vírgula
}

export interface SearchBlock { name: string; terms: string }

export interface ResearchQuestion { id?: string; label?: string; en?: string; pt?: string; codes?: string }

export interface ProtocolSource {
  id: SourceId | string;
  role?: "main" | "comp";
  how?: "api" | "manual";
  date?: string;
  reported?: string;
  custom?: string;      // string ajustada à mão
}

/** Protocolo no mesmo formato do protocolo.json exportado pela Bancada. */
export interface Protocol {
  title?: string;
  objective?: string;
  logic?: string;
  rqIntro?: string;
  gq?: ResearchQuestion;
  sqs?: ResearchQuestion[];
  searchIntro?: string;
  blocks?: SearchBlock[];
  fields?: Partial<Record<Field, boolean>>;
  docTypes?: { journal?: boolean; conference?: boolean };
  docTypesText?: string;
  yearFrom?: string | number;
  yearTo?: string | number;
  langs?: string;
  ic?: Criterion[];
  ec?: Criterion[];
  sources?: ProtocolSource[];
  compPurpose?: string;
  selection?: string;
  excludedTypes?: string;
  suspectTitles?: boolean;
  langFilter?: boolean;
  shortPages?: string | number;
  reviewers?: string | number;
  blind?: boolean;
  updatedAt?: string;
}
