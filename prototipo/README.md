# Protótipo da Bancada PRISMA

`bancada.html` é a versão de referência da interface, feita como página única no Claude.
Todas as telas dela já estão no app em `web/` (uma aba por arquivo em `web/app/projects/[id]/`), e o estilo de `web/app/globals.css` saiu daqui.

A página depende do armazenamento do Claude (`window.claude`), então não funciona aberta direto no navegador. Fica guardada como histórico.

O que não foi levado para o app: as exportações `config.py` e `initial_search_counts.json`, que serviam ao pipeline em Python, substituído pela busca por API do próprio app.
