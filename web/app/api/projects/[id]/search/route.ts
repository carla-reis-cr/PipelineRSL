import { NextResponse } from "next/server";
import { CONNECTORS, ConnectorError, type ConnectorEnv } from "@/lib/connectors";
import { insertRecords, loadProtocol, toRow } from "@/lib/db";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Busca por API, uma página por chamada.
 *
 * POST { source: "scopus" | "ieee_xplore", importId?: string }
 *  - sem importId: cria a importação (método api) e busca a primeira página
 *  - com importId: busca a próxima página a partir do cursor salvo
 * Resposta: { importId, query, total, fetched, inserted, done, notes, quotaRemaining }
 * O cliente repete a chamada até done = true. Se a cota acabar, a importação
 * fica "paused" com o cursor salvo e pode ser retomada depois.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const connector = CONNECTORS[body.source];
  if (!connector) return NextResponse.json({ error: "Base sem busca por API. Use a importação de arquivo." }, { status: 400 });

  const sb = await supabaseServer();
  const protocol = await loadProtocol(sb, projectId);
  if (!protocol) return NextResponse.json({ error: "Projeto não encontrado ou sem acesso." }, { status: 404 });

  const env: ConnectorEnv = {
    ELSEVIER_API_KEY: process.env.ELSEVIER_API_KEY,
    ELSEVIER_INST_TOKEN: process.env.ELSEVIER_INST_TOKEN,
    SCOPUS_VIEW: process.env.SCOPUS_VIEW,
    IEEE_API_KEY: process.env.IEEE_API_KEY,
    IEEE_QUERY_MODE: process.env.IEEE_QUERY_MODE,
  };

  let importId: string = body.importId;
  let cursor: string | null = null;
  if (importId) {
    const { data, error } = await sb.from("imports").select("id,cursor,status,source,record_count").eq("id", importId).eq("project_id", projectId).single();
    if (error || !data) return NextResponse.json({ error: "Importação não encontrada." }, { status: 404 });
    if (data.status === "done") return NextResponse.json({ importId, done: true, fetched: data.record_count });
    cursor = data.cursor;
  } else {
    const { data, error } = await sb.from("imports")
      .insert({ project_id: projectId, source: connector.id, method: "api", query: connector.buildQuery(protocol, env) })
      .select("id").single();
    if (error || !data) return NextResponse.json({ error: "Sem permissão para importar neste projeto." }, { status: 403 });
    importId = data.id;
  }

  try {
    const page = await connector.fetchPage(protocol, cursor, env);
    const offset = (await sb.from("records").select("id", { count: "exact", head: true }).eq("import_id", importId)).count ?? 0;
    const rows = page.records.filter((r) => r.title).map((r, i) => toRow(r, projectId, importId, `${connector.id}:${offset + i}`));
    const inserted = await insertRecords(sb, rows);
    const fetched = offset + inserted;
    const done = !page.nextCursor;
    await sb.from("imports").update({
      query: page.query, total_reported: page.total, cursor: page.nextCursor, record_count: fetched,
      status: done ? "done" : "running", error: null, finished_at: done ? new Date().toISOString() : null,
    }).eq("id", importId);
    return NextResponse.json({ importId, query: page.query, total: page.total, fetched, inserted, done, notes: page.notes ?? [], quotaRemaining: page.quotaRemaining ?? null });
  } catch (e) {
    const err = e instanceof ConnectorError ? e : new ConnectorError(e instanceof Error ? e.message : String(e), 500);
    const paused = err.status === 429;
    await sb.from("imports").update({ status: paused ? "paused" : "error", error: err.message }).eq("id", importId);
    return NextResponse.json({ importId, error: err.message, paused, retryAfterSeconds: err.retryAfterSeconds ?? null }, { status: err.status && err.status >= 400 ? err.status : 500 });
  }
}
