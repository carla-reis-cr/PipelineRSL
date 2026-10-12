# Protótipo da Bancada PRISMA

`bancada.html` é a versão de referência da interface, feita como página única no Claude.
Ela contém as telas que ainda serão levadas para o app em `web/`:

- protocolo (questão geral e secundárias, blocos da string, critérios com regras automáticas, livro de códigos) e documento em Word
- triagem de títulos e resumos com checklist por critério, aceite em lote e consenso
- elegibilidade (leitura completa)
- extração por livro de códigos, matriz e cruzamento entre questões
- fluxograma PRISMA 2020 e funil por base
- concordância e declaração de uso de IA

A página depende do armazenamento do Claude (`window.claude`), então não funciona aberta direto no navegador.
Use-a como especificação: a lógica entre `/* ===================== PURE` e `/* ===================== FIM PURE` já foi portada para `web/lib/`.
