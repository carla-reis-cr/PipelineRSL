# PipelineRSL

Ferramenta web para revisões sistemáticas da literatura seguindo o PRISMA 2020: protocolo, busca nas bases, pré-triagem, triagem em dupla, extração e fluxograma.

O app fica em [`web/`](web/) (Next.js + TypeScript), feito para rodar na **Vercel** com banco no **Supabase**.

## O que já funciona

- **Protocolo editável na própria revisão:** questão geral e secundárias, blocos da string, critérios com regras automáticas, livro de códigos e fontes. A string de cada base é montada na hora, e o protocolo sai em Word, Markdown ou `protocolo.json`.
- **Busca por API no servidor:** Scopus e IEEE Xplore, com as chaves guardadas nas variáveis de ambiente da Vercel. A query e os filtros (campos, anos, tipos de documento, idioma) saem do protocolo. A busca é página a página e pode ser retomada se a cota da base acabar.
- **Importação de arquivos exportados:** BibTeX (ACM, WoS, Wiley…), RIS (ERIC, Scopus), texto e TSV do Web of Science, CSV do Scopus e do Publish or Perish. Os arquivos são lidos no navegador e enviados em lotes.
- **Pré-triagem e critérios:** remoção de duplicatas (DOI e título normalizados), filtros automáticos (tipo, errata/editorial, ano, idioma, artigo curto) e pré-avaliação de cada critério IC/EC pelas regras do protocolo.
- **Triagem e elegibilidade em dupla:** checklist por critério, decisão sugerida, aceite em lote das exclusões indicadas pelas regras, conflitos e consenso. As regras de acesso (RLS) do Supabase só mostram o voto do outro revisor depois que você votou no mesmo registro.
- **Extração:** categorias sugeridas pelo livro de códigos, matriz, frequências e cruzamento entre questões, com exportação em CSV.
- **Fluxograma PRISMA 2020** e funil por base, calculados das decisões, com exportação em SVG e CSV.
- **Uso de IA:** sugestão opcional na triagem (Claude, pela API da Anthropic), exibida a cada revisor só depois do voto dele; concordância (kappa), registro de uso e declaração para o artigo.

As decisões de outros membros da equipe aparecem ao abrir a página ou ao clicar em Atualizar (ainda não há atualização em tempo real).

## Estrutura de `web/`

```
lib/
  types.ts           tipos do protocolo e dos registros
  defaults.ts        protocolo em branco, exemplo e conversão de formatos antigos
  protocol.ts        strings por base e queries das APIs
  protocol-doc.ts    documento do protocolo (tela, Markdown, Word)
  connectors/        Scopus e IEEE Xplore (uma página por chamada)
  parsers.ts         BibTeX, RIS, Web of Science, CSV/TSV
  funnel.ts          duplicatas e filtros automáticos
  criteria.ts        pré-avaliação dos critérios e livro de códigos
  screening.ts       decisão final por registro, números do PRISMA, concordância
  prisma-flow.ts     fluxograma em SVG
  db.ts              leitura e gravação no Supabase
app/
  api/projects/[id]/search   busca por API (POST, uma página por chamada)
  api/projects/[id]/import   importação de arquivo (POST, em lotes)
  api/projects/[id]/funnel   pré-triagem e resumo dos critérios (GET)
  api/projects/[id]/ai       sugestões de IA para a triagem (POST, até 20 registros)
  projects/[id]              a bancada: store.tsx (estado e gravação) e uma aba por arquivo
supabase/migrations/         esquema do banco com regras de acesso
tests/                       testes (vitest)
```

## Como colocar no ar

1. **Supabase:** crie um projeto em supabase.com. No SQL Editor, rode, em ordem, os arquivos de `web/supabase/migrations/` (ou aplique todos com `npx supabase db push --db-url "<string de conexão>"`). Em Authentication › URL Configuration, cadastre a URL do site na Vercel e `https://SEU-SITE/auth/callback` como redirect.
2. **Vercel:** importe este repositório, com **Root Directory = `web`**. Em Environment Variables, preencha as chaves de `web/.env.example`:
   - `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Supabase › Project Settings › API)
   - `ELSEVIER_API_KEY` (e `ELSEVIER_INST_TOKEN`, se for usar fora da rede da instituição)
   - `IEEE_API_KEY`
   - `ANTHROPIC_API_KEY` (opcional, liga a sugestão de IA na triagem; `ANTHROPIC_MODEL` troca o modelo)
3. Faça o deploy, entre com seu e-mail (link mágico) e crie a revisão em branco ou a partir de um `protocolo.json`.
4. Para a triagem em dupla, a segunda pessoa entra no site uma vez com o e-mail dela; depois o dono da revisão a adiciona em Triagem › Equipe.

Para rodar localmente:

```bash
cd web
cp .env.example .env.local   # preencha
npm install
npm run dev
npm test
```

### Observações sobre as APIs

- **Scopus:** com `SCOPUS_VIEW=STANDARD` (padrão), a API não devolve resumo nem palavras-chave do autor. Com direito institucional, `SCOPUS_VIEW=COMPLETE` traz os dois. Sem resumo, a pré-avaliação usa só o título e marca os critérios de resumo como indeterminados.
- **IEEE Xplore:** limite típico de 200 requisições por dia (até 200 registros cada). Os tipos de documento do protocolo viram uma busca por tipo de conteúdo. A API não filtra idioma.
- **ACM, Web of Science e ERIC:** sem API disponível; exporte do site com a string que a ferramenta gera para cada base e importe o arquivo.

## Créditos

A organização das etapas de busca e pré-triagem (conectores por base, importação de exportações manuais, filtros de impureza e deduplicação por DOI e título) se inspira no [LiteraturaReviewPipeline](https://github.com/jsaranda/LiteraturaReviewPipeline), de jsaranda. O código deste repositório foi escrito do zero em TypeScript.
