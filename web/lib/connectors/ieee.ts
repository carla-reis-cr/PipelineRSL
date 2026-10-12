import { blocksOf, docTypeList, fieldList, ieeeQuery, intOr } from "../protocol";
import type { BibRecord, Protocol } from "../types";
import { type Connector, ConnectorError, type SearchPage } from "./types";

/**
 * IEEE Xplore Metadata Search API.
 * Docs: https://developer.ieee.org/docs
 *
 * - Credencial: IEEE_API_KEY. Chaves novas ficam "waiting" por um tempo no painel da IEEE.
 * - Limites típicos: 10 requisições/s e 200 requisições/dia, até 200 registros por requisição.
 * - Tipos de documento do protocolo viram uma busca por content_type (Journals, Conferences);
 *   o cursor guarda em qual tipo e em qual posição a busca está.
 * - Não há filtro de idioma na API: use a regra de idioma da triagem.
 */
const URL_SEARCH = "https://ieeexploreapi.ieee.org/api/v1/search/articles";
const PAGE = 200;

interface IeeeCursor { t: number; s: number }

function contentTypes(p: Protocol): (string | null)[] {
  const m = { journal: "Journals", conference: "Conferences" } as const;
  const l = docTypeList(p).map((d) => m[d]);
  return l.length ? l : [null];
}

export const ieee: Connector = {
  id: "ieee_xplore",
  label: "IEEE Xplore",

  buildQuery(p, env) {
    const mode = env?.IEEE_QUERY_MODE === "fields" ? "fields" : "metadata";
    return ieeeQuery(blocksOf(p), fieldList(p), mode);
  },

  async fetchPage(p, cursor, env, fetchImpl = fetch): Promise<SearchPage> {
    if (!env.IEEE_API_KEY) throw new ConnectorError("IEEE_API_KEY não configurada no servidor.", 500);
    const query = ieee.buildQuery(p, env);
    const types = contentTypes(p);
    const cur: IeeeCursor = cursor ? JSON.parse(cursor) : { t: 0, s: 1 };
    const ct = types[cur.t] ?? null;

    const params = new URLSearchParams({ apikey: env.IEEE_API_KEY, querytext: query, start_record: String(cur.s), max_records: String(PAGE) });
    const yf = intOr(p.yearFrom), yt = intOr(p.yearTo);
    if (yf) params.set("start_year", String(yf));
    if (yt) params.set("end_year", String(yt));
    if (ct) params.set("content_type", ct);

    const res = await fetchImpl(`${URL_SEARCH}?${params}`);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 403 && /limit|quota|over/i.test(body)) throw new ConnectorError("Limite diário da IEEE atingido (200 requisições). Retome amanhã a partir do mesmo ponto.", 429, 3600);
      if (res.status === 401 || res.status === 403) throw new ConnectorError("A IEEE recusou a chave. Chaves novas podem levar algumas horas para ativar.", res.status);
      throw new ConnectorError(`IEEE respondeu ${res.status}: ${body.slice(0, 300)}`, res.status);
    }
    const data = await res.json();
    const total = Number(data.total_records ?? 0);
    const records: BibRecord[] = (Array.isArray(data.articles) ? data.articles : []).map(articleToRecord);

    let next: IeeeCursor | null = null;
    if (records.length && cur.s + PAGE <= total) next = { t: cur.t, s: cur.s + PAGE };
    else if (cur.t + 1 < types.length) next = { t: cur.t + 1, s: 1 };

    const notes: string[] = [];
    if (ct) notes.push(`Tipo de conteúdo: ${ct} (${total} registros).`);
    return { query: ct ? `${query} [content_type=${ct}]` : query, total, records, nextCursor: next ? JSON.stringify(next) : null, quotaRemaining: null, notes };
  },
};

export function articleToRecord(a: any): BibRecord {
  const authors = (a.authors?.authors ?? []).map((x: any) => x.full_name).filter(Boolean).join("; ");
  const kw = a.index_terms?.author_terms?.terms ?? [];
  const sp = intOr(a.start_page), ep = intOr(a.end_page);
  return {
    source: "ieee_xplore",
    title: a.title || "",
    authors,
    year: intOr(a.publication_year),
    venue: a.publication_title || "",
    doi: a.doi || "",
    abstract: a.abstract || "",
    url: a.html_url || a.pdf_url || "",
    docType: a.content_type || "",
    language: "",
    keywords: Array.isArray(kw) ? kw.join("; ") : "",
    pages: sp && ep && ep >= sp ? ep - sp + 1 : null,
    rawId: String(a.article_number ?? ""),
  };
}
