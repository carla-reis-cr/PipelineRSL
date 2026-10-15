import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ieee } from "../lib/connectors/ieee";
import { scopus } from "../lib/connectors/scopus";
import { evalCriteria, suggestCodes, suggestDecision } from "../lib/criteria";
import { EXAMPLE_PROTOCOL, migrateProtocol } from "../lib/defaults";
import { computeFunnel } from "../lib/funnel";
import { flowSVG } from "../lib/prisma-flow";
import { docMD, docModel, protocolChecklist } from "../lib/protocol-doc";
import { pdfDefinition, pdfText } from "../lib/protocol-pdf";
import { deriveFunnel, deriveScreening, kappa, prismaCounts, statusOf, type VoteMap } from "../lib/screening";
import { parseFile } from "../lib/parsers";
import { buildStrings, scopusQuery } from "../lib/protocol";
import type { KeyedRecord, Protocol } from "../lib/types";

const fx = (f: string) => readFileSync(join(__dirname, "fixtures", f), "utf8");
const protocol: Protocol = JSON.parse(fx("protocolo.json"));
const keyed = (rs: any[], pre = "r"): KeyedRecord[] => rs.map((r, i) => ({ ...r, key: `${pre}${i}` }));

describe("parsers", () => {
  it("lê BibTeX da ACM com acentos LaTeX e páginas", () => {
    const bib = `@inproceedings{k1, author = {Silva, Ana and Costa, J{\\"o}rg}, title = {Multi-Agent {Systems}}, year = {2023},
      doi = {10.1145/1}, abstract = {Supply chain \\& routing.}, booktitle = {Proc. X}, pages = {1--10}, numpages = {10}}`;
    const r = parseFile("acm_export.bib", bib);
    expect(r.format).toBe("bib");
    expect(r.guessedSource).toBe("acm_dl");
    expect(r.records[0]).toMatchObject({ title: "Multi-Agent Systems", authors: "Silva, Ana; Costa, Jörg", year: 2023, pages: 10, abstract: "Supply chain & routing.", source: "acm_dl" });
  });

  it("lê texto do Web of Science com linhas de continuação", () => {
    const wos = "FN Clarivate\nVR 1.0\nPT J\nAU Zhang, W\n   Li, Q\nTI Intelligent agents for port\n   logistics\nPY 2021\nDT Article\nLA English\nDI 10.1/x\nER\n\nEF\n";
    const r = parseFile("savedrecs.txt", wos);
    expect(r.format).toBe("wos");
    expect(r.records[0]).toMatchObject({ title: "Intelligent agents for port logistics", authors: "Zhang, W; Li, Q", source: "web_of_science", language: "English" });
  });

  it("lê RIS (ERIC)", () => {
    const ris = "TY  - JOUR\nTI  - AI in entrepreneurship education\nAU  - Lee, K.\nPY  - 2024\nAB  - Abstract.\nLA  - English\nER  - \n";
    const r = parseFile("eric_export.ris", ris);
    expect(r.records[0]).toMatchObject({ title: "AI in entrepreneurship education", year: 2024, docType: "article", source: "eric" });
  });

  it("lê CSV com coluna source_db (formato do pipeline)", () => {
    const r = parseFile("raw.csv", fx("sample.csv"));
    expect(r.hasSourceColumn).toBe(true);
    expect(r.records.map((x) => x.source)).toEqual(["scopus", "ieee_xplore", "scopus", "scopus"]);
    expect(r.records[0].docType).toBe("Article");
  });
});

describe("protocolo e strings", () => {
  it("monta a query da API Scopus com tipos e idioma", () => {
    const q = scopusQuery(protocol);
    expect(q.startsWith("TITLE-ABS-KEY(")).toBe(true);
    expect(q).toContain('"entrepreneurial competenc*"');
    expect(q).toContain("DOCTYPE(ar) OR DOCTYPE(cp)");
    expect(q).toContain("LANGUAGE(english)");
  });
  it("gera uma string por base do protocolo", () => {
    expect(buildStrings(protocol).map((s) => s.id)).toEqual(["scopus", "ieee_xplore", "acm_dl", "web_of_science", "eric"]);
  });
});

describe("funil", () => {
  it("remove duplicatas mantendo o registro com resumo e aplica filtros", () => {
    const recs = keyed([
      { source: "acm_dl", title: "Agentes em Logística", doi: "10.1/A" },
      { source: "scopus", title: "Agentes em logistica!", doi: "https://doi.org/10.1/a", abstract: "tem resumo" },
      { source: "scopus", title: "Erratum: something", year: 2022 },
      { source: "scopus", title: "Old paper", year: 2010 },
      { source: "wos", title: "Chinese paper", language: "Chinese" },
    ]);
    const f = computeFunnel(recs, { ...protocol, yearFrom: 2016 });
    expect(f.dupOf).toEqual({ r0: "r1" });
    expect(Object.keys(f.auto).sort()).toEqual(["r2", "r3", "r4"]);
    expect(f.screen.map((r) => r.key)).toEqual(["r1"]);
  });
});

describe("critérios (mesmo resultado da Bancada e do script Python)", () => {
  it("pré-avalia IC2, IC3, EC1 e EC2", () => {
    const m = { y: "S", n: "N", u: "?" } as const;
    const rows = parseFile("raw.csv", fx("sample.csv")).records.map((r) => {
      const c = evalCriteria(r, protocol);
      return ["IC2", "IC3", "EC1", "EC2"].map((k) => m[c[k].v]).join(" ");
    });
    expect(rows).toEqual(["S S N N", "S ? N S", "N S S N", "S N N N"]);
  });
  it("sugere a decisão a partir das respostas", () => {
    expect(suggestDecision({ IC1: "y", IC2: "y", IC3: "y", EC1: "n", EC2: "n" }, protocol)).toMatchObject({ d: "inc" });
    expect(suggestDecision({ IC1: "y", IC2: "n" }, protocol)).toMatchObject({ d: "exc", r: "IC2" });
    expect(suggestDecision({ IC1: "y", IC2: "y", IC3: "y", EC1: "n", EC2: "y" }, protocol)).toMatchObject({ d: "exc", r: "EC2" });
    expect(suggestDecision({ IC1: "u", IC2: "y", IC3: "y", EC1: "n", EC2: "n" }, protocol)).toMatchObject({ d: "may" });
    expect(suggestDecision({ IC2: "y" }, protocol).d).toBeNull();
  });
  it("sugere categorias do livro de códigos", () => {
    const r = parseFile("raw.csv", fx("sample.csv")).records[0];
    const cats = suggestCodes(r, protocol.sqs![3].codes).map((c) => c.cat);
    expect(cats).toContain("LLM e IA generativa");
  });
});

describe("conectores (API simulada)", () => {
  const fakeFetch = (pages: any[]) => {
    let i = 0;
    const calls: string[] = [];
    const fn = (async (url: string) => {
      calls.push(String(url));
      const body = pages[Math.min(i++, pages.length - 1)];
      return new Response(JSON.stringify(body), { status: 200, headers: { "X-RateLimit-Remaining": "19000" } });
    }) as unknown as typeof fetch;
    return { fn, calls };
  };

  it("Scopus pagina por cursor e mapeia os campos", async () => {
    const { fn, calls } = fakeFetch([
      { "search-results": { "opensearch:totalResults": "2", cursor: { "@next": "AAA" }, entry: [{ "dc:title": "T1", "prism:coverDate": "2023-05-01", "prism:doi": "10.1/x", subtypeDescription: "Article", eid: "2-s2.0-1", "dc:creator": "Silva A." }] } },
      { "search-results": { "opensearch:totalResults": "2", cursor: { "@next": "AAA" }, entry: [] } },
    ]);
    const env = { ELSEVIER_API_KEY: "k" };
    const p1 = await scopus.fetchPage(protocol, null, env, fn);
    expect(p1).toMatchObject({ total: 2, nextCursor: "AAA", quotaRemaining: 19000 });
    expect(p1.records[0]).toMatchObject({ source: "scopus", title: "T1", year: 2023, docType: "Article", rawId: "2-s2.0-1" });
    expect(decodeURIComponent(calls[0])).toContain("cursor=*");
    const p2 = await scopus.fetchPage(protocol, "AAA", env, fn);
    expect(p2.nextCursor).toBeNull();
  });

  it("Scopus pagina por start quando a chave não tem assinatura", async () => {
    const calls: string[] = [];
    const fn = (async (url: string) => {
      const u = decodeURIComponent(String(url));
      calls.push(u);
      if (u.includes("cursor=")) return new Response(JSON.stringify({ "service-error": { status: { statusCode: "INVALID_INPUT", statusText: "Exceeds the maximum number allowed for the service level" } } }), { status: 400 });
      return new Response(JSON.stringify({ "search-results": { "opensearch:totalResults": "60", entry: [{ "dc:title": "T1", eid: "2-s2.0-" + u.match(/start=(\d+)/)![1] }] } }), { status: 200 });
    }) as unknown as typeof fetch;
    const env = { ELSEVIER_API_KEY: "k" };
    const p1 = await scopus.fetchPage(protocol, null, env, fn);
    expect(p1.nextCursor).toBe("s:25");
    expect(calls[1]).toContain("count=25");
    expect(calls[1]).toContain("start=0");
    // as páginas seguintes já vão por start, sem repetir a tentativa com cursor
    const p2 = await scopus.fetchPage(protocol, "s:25", env, fn);
    expect(calls).toHaveLength(3);
    expect(calls[2]).toContain("start=25");
    expect(p2.nextCursor).toBe("s:50");
    expect((await scopus.fetchPage(protocol, "s:50", env, fn)).nextCursor).toBeNull(); // 60 resultados: acabou
  });

  it("Scopus explica o token institucional de outra chave", async () => {
    const fn = (async () => new Response(JSON.stringify({ "service-error": { status: { statusCode: "AUTHENTICATION_ERROR", statusText: "Institution Token is not associated with API Key" } } }), { status: 401 })) as unknown as typeof fetch;
    await expect(scopus.fetchPage(protocol, null, { ELSEVIER_API_KEY: "k", ELSEVIER_INST_TOKEN: "t" }, fn)).rejects.toThrow("não pertence a esta chave");
  });

  it("IEEE faz uma busca por tipo de conteúdo", async () => {
    const art = { title: "A", publication_year: 2022, content_type: "Journals", authors: { authors: [{ full_name: "X Y" }] }, index_terms: { author_terms: { terms: ["k1", "k2"] } } };
    const { fn, calls } = fakeFetch([{ total_records: 1, articles: [art] }, { total_records: 1, articles: [{ ...art, content_type: "Conferences" }] }]);
    const env = { IEEE_API_KEY: "k" };
    const p1 = await ieee.fetchPage(protocol, null, env, fn);
    expect(p1.records[0]).toMatchObject({ authors: "X Y", keywords: "k1; k2", year: 2022 });
    expect(p1.nextCursor).not.toBeNull();
    const p2 = await ieee.fetchPage(protocol, p1.nextCursor, env, fn);
    expect(p2.nextCursor).toBeNull();
    expect(calls[0]).toContain("content_type=Journals");
    expect(calls[1]).toContain("content_type=Conferences");
  });

  it("explica a falta de chave", async () => {
    await expect(scopus.fetchPage(protocol, null, {})).rejects.toThrow("ELSEVIER_API_KEY");
  });
});

describe("triagem, PRISMA e documento", () => {
  const recs: KeyedRecord[] = ["a", "b", "c", "d"].map((k) => ({ key: k, source: "scopus", title: "Estudo " + k, year: 2020, abstract: "x" }));
  const p: Protocol = { ...protocol, yearFrom: "", yearTo: "", ic: [], ec: [{ c: "EC1", t: "Fora do tema" }], reviewers: "2" };
  const f = deriveFunnel(recs, p);
  const votes: VoteMap = {
    ta: { r1: { a: { d: "inc" }, b: { d: "exc", r: "EC1" }, c: { d: "may" }, d: { d: "inc" } }, r2: { a: { d: "may" }, b: { d: "exc" }, c: { d: "exc" } } },
    ft: { r1: { a: { d: "exc", r: "EC1" } }, r2: { a: { d: "exc", r: "EC1" } } },
  };
  const ctx = { votes, cons: { ta: {}, ft: {} }, mode: 2 as const, revIds: ["r1", "r2"] };

  it("combina os dois votos por etapa", () => {
    expect(statusOf("a", "ta", ctx).s).toBe("inc"); // incluir + talvez segue adiante
    expect(statusOf("b", "ta", ctx)).toMatchObject({ s: "exc", r: "EC1" });
    expect(statusOf("c", "ta", ctx).s).toBe("conf");
    expect(statusOf("d", "ta", ctx).s).toBe("pend"); // só um revisor votou
    expect(statusOf("c", "ta", { ...ctx, cons: { ta: { c: { d: "inc" } }, ft: {} } })).toMatchObject({ s: "inc", by: "consenso" });
    expect(statusOf("c", "ta", { ...ctx, mode: 1, revIds: ["r1"] }).s).toBe("inc");
  });
  it("conta o fluxograma a partir das decisões", () => {
    const c = prismaCounts(f, deriveScreening(f, ctx));
    expect(c).toMatchObject({ total: 4, screened: 4, taExc: 1, taPend: 2, sought: 1, assessed: 1, ftExcN: 1, inc: 0, reasons: { EC1: 1 } });
    expect(flowSVG(c, p, true)).toContain("Registros triados (n = 4)");
  });
  it("calcula o kappa de Cohen", () => {
    expect(kappa([[true, true], [false, false]])).toBeNull(); // poucos pares
    expect(kappa([[true, true], [true, true], [false, false], [false, false], [true, false], [false, true]])).toBeCloseTo(1 / 3);
  });
  it("monta o documento do protocolo e completa protocolos antigos", () => {
    const md = docMD(docModel(protocol));
    expect(md).toContain("# Protocolo de Revisão da Literatura");
    expect(md).toContain("## 5. Critérios de Elegibilidade");
    expect(md).toContain("**Estrutura da String:**");
    expect(md).not.toMatch(/String por base|String de busca base/);
    expect(md).not.toContain("TITLE-ABS-KEY"); // sintaxe de base específica fica fora do documento
    expect(buildStrings(protocol, true).at(-1)?.id).toBe("generic");
    const old = migrateProtocol({ question: "Q?", objectives: "O" } as never);
    expect(old.gq?.en).toBe("Q?");
    expect(old.objective).toBe("O");
    expect(old.blind).toBe(true);
  });
  it("confere os tópicos que o protocolo precisa cobrir", () => {
    const missing = (p: Protocol) => protocolChecklist(p).filter((x) => !x.ok).map((x) => x.label);
    expect(missing(migrateProtocol(null))).toEqual(["Recorte temporal", "Critérios de inclusão e exclusão numerados", "Critérios de avaliação de qualidade", "Formulário de extração: um campo por questão", "Quem faz a triagem e como se resolvem divergências"]);
    const full = migrateProtocol({ ...protocol, yearFrom: "2023", yearText: "Popularização da IA generativa.", qa: [{ c: "QA1", t: "Os objetivos estão claros?" }], team: "Autora e orientador" });
    expect(missing(full)).toEqual([]);
    expect(protocolChecklist(full).map((x) => x.target)).toEqual(["sec-recorte", "sec-idioma", "sec-criterios", "sec-qualidade", "sec-questoes", "sec-triagem", "tab:prisma"]);
    const md = docMD(docModel(full));
    expect(md).toContain("**Recorte temporal:** de 2023 até a data da busca. Popularização da IA generativa.");
    expect(md).toContain("**(QA1):** Os objetivos estão claros?");
    expect(md).toContain("### 5.4 Formulário de extração");
    expect(md).toContain("**Divergências:**");
  });
});

describe("PDF do protocolo", () => {
  it("gera um PDF válido a partir do modelo do documento", async () => {
    const { createRequire } = await import("node:module");
    const req = createRequire(import.meta.url);
    const pdfMake = req("pdfmake/build/pdfmake");
    pdfMake.vfs = req("pdfmake/build/vfs_fonts");
    const def = pdfDefinition(docModel(migrateProtocol(structuredClone(EXAMPLE_PROTOCOL))), "Teste");
    const buf: Uint8Array = await new Promise((ok) => pdfMake.createPdf(def).getBuffer(ok));
    expect(Buffer.from(buf.slice(0, 5)).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(5000);
  });

  it("troca por equivalentes os caracteres que a fonte do PDF não tem", () => {
    expect(pdfText("Competência → Evidências ← Fonte ✓ ☐ 😀")).toBe("Competência -> Evidências <- Fonte [x] [ ] ");
    expect(pdfText("≥ 2020 – “ok” ● ○ ■ …")).toBe("≥ 2020 – “ok” ● ○ ■ …");
  });
});
