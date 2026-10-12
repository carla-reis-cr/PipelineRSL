# Passo a passo: do protocolo à extração

Este guia descreve o fluxo completo usando a **Bancada PRISMA** (ferramenta web) e este repositório (busca por API). A regra que vale para todas as etapas: **as regras automáticas sugerem, os revisores decidem**. Nenhum registro é excluído sem uma decisão humana registrada, com exceção dos filtros objetivos de pré-triagem (duplicatas, tipo, ano, idioma), que aparecem no fluxograma PRISMA como "marcados como inelegíveis por ferramentas automáticas".

```
Protocolo (Bancada) ──► protocolo.json ──► conectores Scopus/IEEE (este repositório)
                                                   │
Exportações manuais (ACM, WoS, ERIC) ──────────────┤
                                                   ▼
                                   Importação na Bancada
                                                   │
                     duplicatas + filtros objetivos (automático)
                                                   │
             Triagem T/R: checklist por critério com pré-avaliação
                                                   │
             Elegibilidade: mesmo checklist, leitura completa
                                                   │
             Extração: livro de códigos por questão secundária
                                                   │
             Fluxograma PRISMA 2020 + matriz de extração
```

---

## 1. Protocolo (Bancada, aba 01)

1. Preencha título, objetivo, **questão geral (GQ)** e **questões secundárias (SQ1…SQn)**, em inglês e português.
2. Monte os blocos da string: um termo principal e os termos alternativos, um por linha. Use `*` para truncar (`competenc*`).
3. Marque os campos de busca (título, resumo, palavras-chave), os tipos de documento, os anos e os idiomas.
4. Cadastre os critérios IC e EC. Para cada um, abra **Verificação automática** e escolha a regra:

   | Regra | Para que serve | Exemplo |
   |---|---|---|
   | Manual | Critérios de julgamento | IC1 "estudo empírico primário" |
   | Ano dentro da janela | Período do protocolo | IC "publicado a partir de 2016" |
   | Idioma aceito | Idioma | IC3 "em inglês" |
   | Tipo de documento aceito | Periódico ou conferência | IC "artigo revisado por pares" |
   | Termos de um bloco | Presença do tema de um bloco | IC2 "usa IA" → bloco *Artificial Intelligence* |
   | Todos os blocos da string | O registro contém a string nos campos escolhidos | IC "satisfaz a string" |
   | Lista de termos | Sinais de exclusão | EC2 "literatura cinzenta" → *tutorial; preface; extended abstract* |

   Ao lado de cada regra aparece quantos registros ela marca como atende, não atende ou indeterminado. Use isso para calibrar: se uma regra de exclusão pega muitos registros, revise a lista de termos antes da triagem.

5. Em cada questão secundária, preencha o **livro de códigos**, uma categoria por linha:
   ```
   LLM e IA generativa: large language model*; LLM*; ChatGPT; generative AI
   Feedback automatizado: feedback
   ```
6. Em **Ver documento**, confira o protocolo e baixe o Word. A versão e a data de alteração saem no rodapé.

> **Ajustes ao longo do caminho.** Toda mudança em critério, regra ou livro de códigos fica com data no documento. Se mudar um critério depois do início da triagem, registre o motivo no protocolo (seção 5): o PRISMA pede que desvios do protocolo sejam relatados.

## 2. Busca por API (este repositório)

1. Na Bancada, aba Protocolo, clique em **protocolo.json** e salve o arquivo na raiz deste repositório.
2. Configure as chaves no `.env` (veja `.env.example`):
   ```
   ELSEVIER_API_KEY=...
   ELSEVIER_INST_TOKEN=...   # opcional, fora da rede da instituição
   IEEE_API_KEY=...
   ```
3. Rode os conectores:
   ```bash
   python connectors/scopus.py
   python connectors/ieee_xplore.py
   ```
   Cada um imprime a query usada (anote no protocolo junto com a data) e grava dois arquivos em `data/raw/`:
   - `<base>_results.csv`, no formato original do pipeline;
   - `<base>_results_bancada.csv`, com tipo de documento e palavras-chave, **para importar na Bancada**.

   Como os filtros do protocolo viram parâmetros da API:

   | Protocolo | Scopus | IEEE Xplore |
   |---|---|---|
   | Campos | `TITLE-ABS-KEY`, `TITLE-ABS`, … | `IEEE_QUERY_MODE=metadata` (padrão) busca em todos os metadados; `fields` qualifica termo a termo |
   | Anos | `PUBYEAR` | `start_year` / `end_year` |
   | Tipos | `DOCTYPE(ar)`, `DOCTYPE(cp)` | uma busca por `content_type` (Journals, Conferences) |
   | Idioma | `LANGUAGE(english)` | não há filtro: use a regra de idioma na Bancada |

   No modo `metadata`, o IEEE devolve mais registros do que a busca por título, resumo e palavras-chave. Para manter a mesma cobertura das outras bases, crie na Bancada um critério com a regra **Todos os blocos da string**.

4. Opcional: confira as regras antes de importar.
   ```bash
   python pipeline/criteria_report.py
   ```
   Gera `data/processed/criteria_report.csv` (um registro por linha, com S/N/? e o trecho que justifica) e um resumo por critério. As regras são as mesmas da Bancada.

## 3. Exportações manuais (ACM, Web of Science, ERIC)

Use a string de cada base que aparece na aba Protocolo da Bancada (botão **Copiar**).

- **ACM DL:** Advanced Search → Edit Query → cole. Selecione todos → Export Citations → BibTeX.
- **Web of Science:** Advanced Search → Query Builder → cole. Export → Plain text ou Tab delimited, *Full Record*. Máximo de 1.000 por exportação: exporte em lotes.
- **ERIC (EBSCOhost):** cole na busca avançada; exporte em RIS.

Anote na Bancada a data da busca e o total informado por base.

## 4. Importação (Bancada, aba 02)

Solte todos os arquivos: os `*_bancada.csv` do pipeline e as exportações manuais. A Bancada reconhece o formato e a base. Confira a coluna **Importado × Informado**: diferenças acima de 2% indicam exportação incompleta.

## 5. Triagem de títulos e resumos (aba 03)

Cada revisor entra na sua vaga (Revisor 1 ou 2). Para cada registro:

1. Leia título, resumo e palavras-chave. Os termos de cada bloco aparecem destacados.
2. No **checklist de critérios**, cada linha mostra a pré-avaliação da regra (atende, não atende, indeterminado ou manual) com o trecho que a justifica.
3. Tecle **A** para aceitar todas as pré-avaliações, ou clique critério a critério. As linhas manuais você responde.
4. A ferramenta calcula a decisão sugerida:
   - algum IC "não atende" → **excluir**, com aquele IC como motivo;
   - algum EC "se aplica" → **excluir**, com aquele EC como motivo;
   - todos os IC atendem e nenhum EC se aplica → **incluir**;
   - há critérios incertos → **talvez** (segue para a leitura completa).
5. Tecle **Enter** para registrar a decisão sugerida, ou use I / T / E para decidir diferente.

**Em lote.** O painel *Exclusões sugeridas pelas regras* mostra, por critério, quantos registros pendentes a regra exclui. Clique em **Revisar lista**, percorra os títulos e, se concordar, **Aceitar todas**. Cada aceite vira uma decisão sua, com o critério como motivo e a marca "em lote".

**Conflitos.** Com dois revisores, a decisão do outro fica oculta até você decidir. Divergências aparecem no filtro **Conflitos** e são resolvidas por consenso.

## 6. Elegibilidade (aba 04)

Mesmo checklist, agora com a leitura do artigo completo (ou do resumo e metadados, quando o texto completo não estiver acessível). Exclusões exigem o motivo. Use **Não recuperado** quando não conseguir o texto.

## 7. Extração de dados (aba 05)

Para cada estudo incluído e cada questão secundária:

1. A ferramenta sugere categorias do livro de códigos, mostrando o termo e o trecho do resumo onde apareceu.
2. **Aceitar** ou **Recusar** cada sugestão. Use *Outra categoria* para o que o livro de códigos não cobre; se a categoria se repetir, acrescente-a ao livro de códigos no Protocolo.
3. Registre a evidência (trecho que sustenta a codificação).
4. Marque **Extração concluída**.

Na visão **Matriz e taxonomia**: matriz estudo × questão, frequência das categorias e cruzamento entre duas questões (por exemplo SQ1 × SQ4, competência × método). Exporte a matriz e a codificação detalhada em CSV.

## 8. Relato

- **Fluxograma PRISMA 2020** (aba 06): atualizado a cada decisão; baixe em SVG.
- **Funil por base**: equivalente ao `report_per_base_funnel.py`.
- **Uso de IA e concordância** (aba 07): kappa entre revisores e registro de ferramentas. Se nenhuma IA generativa for usada, a declaração diz isso. As regras automáticas por termos não são IA generativa, mas descreva-as nos métodos (o documento do protocolo já traz cada regra).

---

### Calibração das regras (recomendado)

Antes da triagem completa:

1. Escolha 50 registros ao acaso e faça a triagem **sem aceitar a pré-avaliação** (responda cada critério lendo).
2. Compare com o `criteria_report.csv` (ou com a coluna de pré-avaliação na Bancada).
3. Ajuste termos das regras que erraram e rode de novo.
4. Registre no protocolo a versão das regras usada na triagem.
