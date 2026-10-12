import type { BibRecord, Protocol } from "../types";

/**
 * Uma página de resultados de uma base. As buscas por API são feitas página a
 * página para caber no tempo de execução de uma função serverless: quem chama
 * guarda `nextCursor` e pede a próxima página até ele vir nulo.
 */
export interface SearchPage {
  query: string;
  total: number;            // total informado pela base para a query
  records: BibRecord[];
  nextCursor: string | null;
  /** cota restante informada pela base, quando houver */
  quotaRemaining?: number | null;
  notes?: string[];
}

export interface ConnectorEnv {
  ELSEVIER_API_KEY?: string;
  ELSEVIER_INST_TOKEN?: string;
  SCOPUS_VIEW?: string;          // STANDARD (padrão) ou COMPLETE (traz resumo; exige direito institucional)
  IEEE_API_KEY?: string;
  IEEE_QUERY_MODE?: string;      // metadata (padrão) ou fields
}

export interface Connector {
  id: string;
  label: string;
  /** Monta a query que será enviada, sem chamar a API. */
  buildQuery(p: Protocol, env?: ConnectorEnv): string;
  /** Busca uma página. `cursor` nulo = primeira página. */
  fetchPage(p: Protocol, cursor: string | null, env: ConnectorEnv, fetchImpl?: typeof fetch): Promise<SearchPage>;
}

export class ConnectorError extends Error {
  constructor(message: string, public status?: number, public retryAfterSeconds?: number) {
    super(message);
    this.name = "ConnectorError";
  }
}
