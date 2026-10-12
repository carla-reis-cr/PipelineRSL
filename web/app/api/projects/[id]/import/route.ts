import { NextResponse } from "next/server";
import { insertRecords, toRow } from "@/lib/db";
import { parseFile } from "@/lib/parsers";
import type { BibRecord } from "@/lib/types";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Importação de arquivo exportado (ACM, Web of Science, ERIC, Scopus CSV…).
 *
 * Arquivos grandes: o navegador lê o arquivo com lib/parsers e envia os registros
 * em lotes, para respeitar o limite de 4,5 MB por requisição da Vercel.
 *   POST { fileName, source, records: BibRecord[], importId?, offset, last }
 * Arquivos pequenos podem ir inteiros:
 *   POST { fileName, source?, text }
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body?.fileName) return NextResponse.json({ error: "Informe o arquivo." }, { status: 400 });

  let records: BibRecord[] = body.records ?? [];
  let source: string = body.source ?? "";
  if (typeof body.text === "string") {
    const parsed = parseFile(body.fileName, body.text, body.source || undefined);
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 422 });
    records = parsed.records;
    source = source || (parsed.hasSourceColumn ? "varias" : parsed.guessedSource || "other");
  }
  if (!records.length) return NextResponse.json({ error: "Nenhum registro para importar." }, { status: 422 });

  const sb = await supabaseServer();
  let importId: string = body.importId;
  if (!importId) {
    const { data, error } = await sb.from("imports")
      .insert({ project_id: projectId, source: source || "other", method: "file", file_name: body.fileName, status: "running" })
      .select("id").single();
    if (error || !data) return NextResponse.json({ error: "Sem permissão para importar neste projeto." }, { status: 403 });
    importId = data.id;
  }
  const offset = Number(body.offset) || 0;
  try {
    const inserted = await insertRecords(sb, records.map((r, i) => toRow({ ...r, rawId: r.rawId || "" }, projectId, importId, `file:${offset + i}`)));
    const last = typeof body.text === "string" || body.last !== false;
    const { count } = await sb.from("records").select("id", { count: "exact", head: true }).eq("import_id", importId);
    await sb.from("imports").update({ record_count: count ?? 0, status: last ? "done" : "running", finished_at: last ? new Date().toISOString() : null }).eq("id", importId);
    return NextResponse.json({ importId, inserted, total: count ?? 0, done: last });
  } catch (e) {
    await sb.from("imports").update({ status: "error", error: String(e) }).eq("id", importId);
    return NextResponse.json({ importId, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
