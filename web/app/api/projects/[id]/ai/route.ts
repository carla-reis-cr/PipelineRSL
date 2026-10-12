import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { NextResponse } from "next/server";
import { z } from "zod";
import { fromRow, loadProtocol } from "@/lib/db";
import { supabaseServer } from "@/lib/supabase/server";
import type { Protocol } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_MODEL = "claude-opus-5-5";
const MAX_BATCH = 20;

const Suggestions = z.object({
  items: z.array(z.object({
    i: z.number().describe("número do registro"),
    d: z.enum(["include", "maybe", "exclude"]),
    c: z.string().describe("código do critério que motivou a exclusão, ou vazio"),
    r: z.string().describe("motivo em até 12 palavras"),
  })),
});

function instructions(p: Protocol): string {
  const sqs = (p.sqs ?? []).filter((x) => x.en || x.pt).map((x) => `${x.id}: ${x.en || x.pt}`).join("\n");
  const crit = (list: Protocol["ic"]) => (list ?? []).filter((c) => c.c).map((c) => `${c.c}: ${c.t}`).join("\n");
  return `Você apoia a triagem de títulos e resumos de uma revisão sistemática da literatura. Sua classificação é só uma sugestão: revisores humanos tomam todas as decisões, e só veem a sua sugestão depois de decidir.

Questão geral: ${p.gq?.en || p.gq?.pt || p.title || ""}
${sqs}

Critérios de inclusão:
${crit(p.ic)}

Critérios de exclusão:
${crit(p.ec)}

Para cada registro, responda "include" se houver indícios de que atende a todos os critérios de inclusão, "maybe" se a informação for insuficiente para decidir, ou "exclude" se algum critério de exclusão claramente se aplica ou algum critério de inclusão claramente não é atendido. Ao excluir, informe o código do critério. Devolva um item para cada registro recebido, com o mesmo número.`;
}

/**
 * Sugestões de IA para a triagem de títulos e resumos.
 *   POST { ids: string[] }  (até 20 registros por chamada)
 * Resposta: { saved, model }. As sugestões não voltam na resposta: quem ocupa uma
 * vaga de revisor só as lê, pelo banco, depois de votar no registro.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await ctx.params;
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Sugestão por IA não configurada no servidor (ANTHROPIC_API_KEY).", fatal: true }, { status: 501 });
  const body = await req.json().catch(() => null);
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === "string").slice(0, MAX_BATCH) : [];
  if (!ids.length) return NextResponse.json({ error: "Informe os registros." }, { status: 400 });

  const sb = await supabaseServer();
  const protocol = await loadProtocol(sb, projectId);
  if (!protocol) return NextResponse.json({ error: "Projeto não encontrado ou sem acesso.", fatal: true }, { status: 404 });
  const { data: allowed } = await sb.rpc("can_edit", { p: projectId });
  if (!allowed) return NextResponse.json({ error: "Sem permissão para pedir sugestões neste projeto.", fatal: true }, { status: 403 });
  const { data: rows, error } = await sb.from("records").select("*").eq("project_id", projectId).in("id", ids);
  if (error || !rows?.length) return NextResponse.json({ error: "Registros não encontrados." }, { status: 404 });
  const records = rows.map(fromRow);
  const items = records.map((r, j) => ({ i: j + 1, titulo: r.title, resumo: r.abstract || "(sem resumo)", palavras_chave: r.keywords || "", veiculo: r.venue || "", ano: r.year ?? "" }));

  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const client = new Anthropic();
  let parsed: z.infer<typeof Suggestions> | null;
  try {
    const res = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      // classificação curta: esforço baixo basta e custa menos
      output_config: { effort: "low", format: betaZodOutputFormat(Suggestions) },
      // se o modelo recusar o pedido, a API tenta de novo em outro modelo (só vale para o modelo padrão)
      ...(model === DEFAULT_MODEL ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      system: [{ type: "text", text: instructions(protocol), cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: "Registros:\n" + JSON.stringify(items) }],
    });
    if (res.stop_reason === "refusal") return NextResponse.json({ error: "O modelo recusou este lote; ele foi pulado." }, { status: 422 });
    parsed = res.parsed_output;
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return NextResponse.json({ error: "Chave da API da Anthropic inválida.", fatal: true }, { status: 502 });
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "Limite de uso da API atingido. Tente de novo mais tarde.", fatal: true }, { status: 429 });
    if (e instanceof Anthropic.APIError) return NextResponse.json({ error: `A API da Anthropic respondeu com erro ${e.status ?? ""}.`.trim(), fatal: (e.status ?? 500) < 500 }, { status: 502 });
    throw e;
  }
  if (!parsed) return NextResponse.json({ error: "Resposta da IA fora do formato; lote pulado." }, { status: 502 });

  const DECISION = { include: "inc", maybe: "may", exclude: "exc" } as const;
  const out = parsed.items.flatMap((o) => {
    const r = records[o.i - 1];
    return r ? [{ record_id: r.key, project_id: projectId, decision: DECISION[o.d], criterion: o.c.slice(0, 12) || null, reason: o.r.slice(0, 160) || null, model }] : [];
  });
  // registros que já têm sugestão ficam como estão
  const { error: insErr } = await sb.from("ai_suggestions").upsert(out, { onConflict: "record_id", ignoreDuplicates: true });
  if (insErr) return NextResponse.json({ error: insErr.message, fatal: true }, { status: 500 });
  return NextResponse.json({ saved: out.length, model });
}
