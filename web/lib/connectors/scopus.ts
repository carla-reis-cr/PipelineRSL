import { scopusQuery } from "../protocol";
import type { BibRecord, Protocol } from "../types";
import { type Connector, ConnectorError, type ConnectorEnv, type SearchPage } from "./types";

/**
 * Scopus Search API (Elsevier).
 * Docs: https://dev.elsevier.com/documentation/ScopusSearchAPI.wadl
 *
 * - Credenciais: ELSEVIER_API_KEY e, fora da rede da instituição, ELSEVIER_INST_TOKEN.
 * - Paginação por cursor (cursor=*), que não tem o limite de 5.000 registros da paginação por start.
 * - view=STANDARD não traz o resumo. Com direito institucional, SCOPUS_VIEW=COMPLETE traz
 *   resumo (dc:description), palavras-chave e todos os autores; nesse caso a página tem 25 registros (STANDARD: 200).
 * - Chaves sem assinatura institucional não podem usar cursor nem páginas de mais de 25 registros.
 *   Quando a API recusa o pedido por isso, a busca passa a paginar por start, de 25 em 25, e o cursor
 *   guardado vira "s:<posição>". Nesse modo a Scopus só entrega os primeiros 5.000 resultados.
 */
const URL_SEARCH = "https://api.elsevier.com/content/search/scopus";
const START = "s:";
const START_PAGE = 25, START_LIMIT = 5000;
const RESTRICTED = /maximum number allowed for the service level|cursor parameter is restricted/i;

export const scopus: Connector = {
  id: "scopus",
  label: "Scopus",

  buildQuery(p: Protocol) {
    return scopusQuery(p);
  },

  async fetchPage(p, cursor, env, fetchImpl = fetch): Promise<SearchPage> {
    if (!env.ELSEVIER_API_KEY) throw new ConnectorError("ELSEVIER_API_KEY não configurada no servidor.", 500);
    const query = scopusQuery(p);
    const view = (env.SCOPUS_VIEW || "STANDARD").toUpperCase();
    const headers: Record<string, string> = { "X-ELS-APIKey": env.ELSEVIER_API_KEY, Accept: "application/json" };
    if (env.ELSEVIER_INST_TOKEN) headers["X-ELS-Insttoken"] = env.ELSEVIER_INST_TOKEN;
    let start = cursor?.startsWith(START) ? Number(cursor.slice(START.length)) : null;
    const request = () => {
      const page: Record<string, string> = start != null ? { count: String(START_PAGE), start: String(start) } : { count: view === "COMPLETE" ? "25" : "200", cursor: cursor || "*" };
      return fetchImpl(`${URL_SEARCH}?${new URLSearchParams({ query, view, ...page })}`, { headers });
    };

    let res = await request();
    if (!res.ok && start == null && !cursor && RESTRICTED.test(await res.clone().text().catch(() => ""))) {
      start = 0;
      res = await request();
    }
    const quota = res.headers.get("X-RateLimit-Remaining");
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 401 || res.status === 403) {
        const why = statusText(body);
        throw new ConnectorError(
          /institution token/i.test(why) ? "A Scopus recusou o ELSEVIER_INST_TOKEN: ele não pertence a esta chave. Deixe a variável vazia ou use o token emitido para a mesma chave."
            : view === "COMPLETE" ? "A Scopus recusou a chave para view=COMPLETE. Use SCOPUS_VIEW=STANDARD ou acesse pela rede da instituição (ou com ELSEVIER_INST_TOKEN)."
            : `A Scopus recusou a chave${why ? ` (${why})` : ""}. Confira ELSEVIER_API_KEY e, fora da rede da instituição, ELSEVIER_INST_TOKEN.`,
          res.status,
        );
      }
      if (res.status === 429) {
        const reset = Number(res.headers.get("X-RateLimit-Reset"));
        const wait = Number.isFinite(reset) && reset > 0 ? Math.max(1, Math.round(reset - Date.now() / 1000)) : 60;
        throw new ConnectorError("Cota da Scopus esgotada. Retome mais tarde a partir do mesmo ponto.", 429, wait);
      }
      throw new ConnectorError(`Scopus respondeu ${res.status}: ${body.slice(0, 300)}`, res.status);
    }

    const data = (await res.json())?.["search-results"] ?? {};
    const total = Number(data["opensearch:totalResults"] ?? 0);
    const entries: any[] = Array.isArray(data.entry) ? data.entry : [];
    const records = entries.filter((e) => !e.error).map(entryToRecord);
    const notes = view === "STANDARD" ? ["view=STANDARD não traz resumo nem palavras-chave do autor. A triagem fica só com o título até completar os resumos."] : [];
    let nextCursor: string | null;
    if (start != null) {
      const reach = Math.min(total, START_LIMIT), nextStart = start + START_PAGE;
      nextCursor = records.length && nextStart < reach ? START + nextStart : null;
      notes.push("Esta chave não tem assinatura institucional: a busca vai de 25 em 25 registros e usa mais requisições da cota.");
      if (total > START_LIMIT) notes.push(`A Scopus só entrega os primeiros ${START_LIMIT.toLocaleString("pt-BR")} dos ${total.toLocaleString("pt-BR")} resultados a chaves sem assinatura. Para o conjunto completo, exporte o CSV pelo site e importe o arquivo.`);
    } else {
      const next: string | undefined = data.cursor?.["@next"];
      nextCursor = records.length && next && next !== cursor ? next : null;
    }
    return { query, total, records, nextCursor, quotaRemaining: quota != null ? Number(quota) : null, notes };
  },
};

function statusText(body: string): string {
  try { return JSON.parse(body)?.["service-error"]?.status?.statusText ?? ""; } catch { return ""; }
}

export function entryToRecord(e: any): BibRecord {
  const authors = Array.isArray(e.author)
    ? e.author.map((a: any) => a.authname || [a.surname, a["given-name"]].filter(Boolean).join(", ")).filter(Boolean).join("; ")
    : e["dc:creator"] || "";
  const link = Array.isArray(e.link) ? e.link.find((l: any) => l["@ref"] === "scopus")?.["@href"] : "";
  const pr = String(e["prism:pageRange"] || "");
  const m = pr.match(/(\d+)\s*-\s*(\d+)/);
  return {
    source: "scopus",
    title: e["dc:title"] || "",
    authors,
    year: e["prism:coverDate"] ? Number(String(e["prism:coverDate"]).slice(0, 4)) : null,
    venue: e["prism:publicationName"] || "",
    doi: e["prism:doi"] || "",
    abstract: e["dc:description"] || "",
    url: link || "",
    docType: e.subtypeDescription || "",
    language: "",
    keywords: String(e.authkeywords || "").split("|").map((s) => s.trim()).filter(Boolean).join("; "),
    pages: m && +m[2] >= +m[1] ? +m[2] - +m[1] + 1 : null,
    rawId: e.eid || e["dc:identifier"] || "",
  };
}

export type { ConnectorEnv };
