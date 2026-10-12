import type { SupabaseClient } from "@supabase/supabase-js";
import type { BibRecord, KeyedRecord, Protocol } from "./types";

/** Converte um registro para a linha da tabela records. */
export function toRow(r: BibRecord, projectId: string, importId: string, fallbackId: string) {
  return {
    project_id: projectId,
    import_id: importId,
    source: String(r.source || "other"),
    title: r.title,
    authors: r.authors || null,
    year: r.year ?? null,
    venue: r.venue || null,
    doi: r.doi || null,
    abstract: r.abstract || null,
    url: r.url || null,
    doc_type: r.docType || null,
    language: r.language || null,
    keywords: r.keywords || null,
    pages: r.pages ?? null,
    raw_id: r.rawId || fallbackId,
  };
}

export function fromRow(row: any): KeyedRecord {
  return {
    key: row.id, source: row.source, title: row.title, authors: row.authors ?? "", year: row.year, venue: row.venue ?? "",
    doi: row.doi ?? "", abstract: row.abstract ?? "", url: row.url ?? "", docType: row.doc_type ?? "", language: row.language ?? "",
    keywords: row.keywords ?? "", pages: row.pages, rawId: row.raw_id,
  };
}

/** Grava registros em lotes, ignorando os que já existem (mesma importação e mesmo raw_id). */
export async function insertRecords(sb: SupabaseClient, rows: ReturnType<typeof toRow>[]) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const { error, count } = await sb.from("records").upsert(rows.slice(i, i + 500), { onConflict: "import_id,raw_id", ignoreDuplicates: true, count: "exact" });
    if (error) throw new Error(error.message);
    inserted += count ?? 0;
  }
  return inserted;
}

export async function loadProtocol(sb: SupabaseClient, projectId: string): Promise<Protocol | null> {
  const { data, error } = await sb.from("projects").select("protocol").eq("id", projectId).single();
  if (error || !data) return null;
  return data.protocol as Protocol;
}

/** Lê todos os registros do projeto, paginando de 1.000 em 1.000. */
export async function loadRecords(sb: SupabaseClient, projectId: string): Promise<KeyedRecord[]> {
  const out: KeyedRecord[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("records").select("*").eq("project_id", projectId).order("created_at").order("id").range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []).map(fromRow));
    if (!data || data.length < 1000) break;
  }
  return out;
}
