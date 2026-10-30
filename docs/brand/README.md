# bid · Brand kit v1.0

Identidade minimalista aprovada: duas propostas sobrepostas, lettering próprio com corte no “d”, índigo profundo e marfim. Data da entrega: 30/10/2026.

- [Manual visual em PDF](../../output/pdf/bid-manual-da-marca-v1.pdf)
- [Catálogo visual local](index.html): abrir no navegador; inclui alternância de tema e exemplos de componentes.
- [Guidelines editáveis](GUIDELINES.md)
- [Especificação do design system](DESIGN-SYSTEM.md)
- [Tokens JSON](tokens.json) e [CSS de referência](tokens.css)
- [Vetores](assets/) e [fontes com licença](fonts/)
- [Pacote para compartilhar](bid-brand-kit-v1.zip)
- [Relatório de contraste](contrast-report.json)

O SVG é a fonte de verdade do desenho. Os arquivos de logo não dependem da instalação de fontes. A Sora é usada no conteúdo e nos componentes, não para redigitar o lettering da marca.

## Status

Kit, documentação e catálogo são entregáveis desta etapa. `packages/ui` e `apps/web` ainda usam a identidade anterior; não houve publicação nem migração de telas. O plano de adoção está no design system.

## Regenerar

Executar `python docs/brand/build_brand.py` com `reportlab`, `fonttools`, `brotli` e `requests` disponíveis. A primeira execução baixa a Sora e a licença do repositório oficial Google Fonts; as seguintes reutilizam a fonte local. Revisar novamente o PDF renderizado após regenerar. O ZIP é um pacote de distribuição, não a fonte editável.
