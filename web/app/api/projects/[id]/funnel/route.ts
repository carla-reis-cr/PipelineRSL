import { NextResponse } from "next/server";
import { evalCriteria } from "@/lib/criteria";
import { loadProtocol, loadRecords } from "@/lib/db";
import { computeFunnel } from "@/lib/funnel";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Funil de pré-triagem e pré-avaliação dos critérios, calculados a partir do
 * protocolo atual. Nada é gravado: mudar uma regra no protocolo muda o resultado.
 * GET ?detail=1 inclui, por registro, o motivo do filtro e a avaliação de cada critério.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await ctx.params;
  const sb = await supabaseServer();
  const protocol = await loadProtocol(sb, projectId);
  if (!protocol) return NextResponse.json({ error: "Projeto não encontrado ou sem acesso." }, { status: 404 });
  const records = await loadRecords(sb, projectId);
  const f = computeFunnel(records, protocol);

  const bySource: Record<string, { identified: number; duplicates: number; automation: number; screen: number }> = {};
  for (const r of records) {
    const s = (bySource[r.source] ??= { identified: 0, duplicates: 0, automation: 0, screen: 0 });
    s.identified++;
    if (f.dupOf[r.key]) s.duplicates++;
    else if (f.auto[r.key]) s.automation++;
    else s.screen++;
  }
  const autoReasons: Record<string, number> = {};
  Object.values(f.auto).forEach((v) => { const k = v.split(":")[0]; autoReasons[k] = (autoReasons[k] ?? 0) + 1; });

  const critSummary: Record<string, { y: number; n: number; u: number }> = {};
  const detail = new URL(req.url).searchParams.get("detail") === "1";
  const perRecord: Record<string, unknown> = {};
  for (const r of f.screen) {
    const c = evalCriteria(r, protocol);
    for (const [code, e] of Object.entries(c)) (critSummary[code] ??= { y: 0, n: 0, u: 0 })[e.v]++;
    if (detail) perRecord[r.key] = c;
  }
  return NextResponse.json({
    identified: records.length,
    duplicates: Object.keys(f.dupOf).length,
    automation: Object.keys(f.auto).length,
    screen: f.screen.length,
    bySource, autoReasons, criteria: critSummary,
    ...(detail ? { auto: f.auto, dupOf: f.dupOf, perRecord } : {}),
  });
}
