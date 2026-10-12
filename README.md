# PipelineRSL

Ferramenta web para revisões sistemáticas da literatura seguindo o PRISMA 2020: protocolo, busca nas bases, pré-triagem, triagem em dupla, extração e fluxograma.

O app fica em [`web/`](web/) (Next.js + TypeScript), feito para rodar na **Vercel** com banco no **Supabase**.

## O que já funciona

- **Projetos a partir do protocolo:** crie a revisão enviando o `protocolo.json` exportado da Bancada PRISMA (protótipo da interface).
- **Busca por API no servidor:** Scopus e IEEE Xplore, com as chaves guardadas nas variáveis de ambiente da Vercel. A query e os filtros (campos, anos, tipos de documento, idioma) saem do protocolo. A busca é página a página e pode ser retomada se a cota da base acabar.
- **Importação de arquivos exportados:** BibTeX (ACM, WoS, Wiley…), RIS (ERIC, Scopus), texto e TSV do Web of Science, CSV do Scopus e do Publish or Perish. O arquivo é lido no navegador e enviado em lotes.
- **Pré-triagem e critérios:** remoção de duplicatas (DOI e título normalizados), filtros automáticos (tipo, errata/editorial, ano, idioma, artigo curto) e pré-avaliação de cada critério IC/EC pelas regras do protocolo.
- **Banco com triagem cega de verdade:** as regras de acesso (RLS) do Supabase só mostram o voto do outro revisor depois que você votou no mesmo registro.

## Próximas etapas

Levar para o app as telas que hoje estão no protótipo: edição do protocolo e documento em Word, triagem com checklist por critério, elegibilidade, extração por livro de códigos e fluxograma PRISMA.

## Estrutura de `web/`

```
lib/
  types.ts           tipos do protocolo e dos registros
  protocol.ts        strings por base e queries das APIs
  connectors/        Scopus e IEEE Xplore (uma página por chamada)
  parsers.ts         BibTeX, RIS, Web of Science, CSV/TSV
  funnel.ts          duplicatas e filtros automáticos
  criteria.ts        pré-avaliação dos critérios e livro de códigos
  db.ts              leitura e gravação no Supabase
app/
  api/projects/[id]/search   busca por API (POST, uma página por chamada)
  api/projects/[id]/import   importação de arquivo (POST, em lotes)
  api/projects/[id]/funnel   pré-triagem e resumo dos critérios (GET)
  projects/[id]              tela do projeto
supabase/migrations/         esquema do banco com regras de acesso
tests/                       testes (vitest)
```

## Como colocar no ar

1. **Supabase:** crie um projeto em supabase.com. No SQL Editor, rode `web/supabase/migrations/0001_schema.sql`. Em Authentication › URL Configuration, cadastre a URL do site na Vercel e `https://SEU-SITE/auth/callback` como redirect.
2. **Vercel:** importe este repositório, com **Root Directory = `web`**. Em Environment Variables, preencha as chaves de `web/.env.example`:
   - `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase › Project Settings › API)
   - `ELSEVIER_API_KEY` (e `ELSEVIER_INST_TOKEN`, se for usar fora da rede da instituição)
   - `IEEE_API_KEY`
3. Faça o deploy, entre com seu e-mail (link mágico) e crie a revisão com o `protocolo.json`.

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
