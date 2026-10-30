# bid · Design system v1.0

30 de outubro de 2026. Especificação e biblioteca de referência para adoção no aplicativo.

## Estado da entrega

O kit define a nova identidade aprovada e inclui tokens executáveis, estilos de referência, vetores e um catálogo local interativo. Não substitui automaticamente `packages/ui`: esse pacote ainda contém a identidade anterior. Os componentes abaixo distinguem o que está demonstrado do que deve ser implementado na migração.

| Elemento | Entrega nesta versão |
| --- | --- |
| Marca, símbolo e ícone | SVGs mestres independentes de fontes |
| Cor, temas, espaço, raio e movimento | `tokens.json` e `tokens.css` |
| Fonte de interface | Sora local, variável e estática, com OFL |
| Botão, campo, cartão e status | CSS e demonstração interativa em `index.html` |
| Upload, navegação, modal, comparação e feedback | Contratos de comportamento documentados abaixo |
| Integração React, favicon raster e auditoria das telas | Etapa de adoção no aplicativo |

## Uso dos fundamentos

Importar `tokens.css` e aplicar `.bid-ds` ao contêiner da interface. `data-theme="light"` e `data-theme="dark"` fixam a escolha; sem atributo, a preferência do sistema operacional controla o tema. O catálogo abre em modo claro para apresentar a identidade e oferece alternância explícita. Não aplicar as duas famílias de tokens simultaneamente na mesma tela.

O CSS serve como referência implementável e tem escopo `.bid-ds` nos fundamentos. Classes de componentes usam prefixo `bid-`. A fonte WOFF2 é carregada localmente. Não importar arquivos estáticos TTF no aplicativo quando o WOFF2 já atender ao uso.

```html
<link rel="stylesheet" href="tokens.css" />
<div class="bid-ds" data-theme="light">
  <button class="bid-btn" type="button">Adicionar proposta</button>
</div>
```

### Mapeamento para o pacote existente

| Token atual | Novo papel | Observação |
| --- | --- | --- |
| `--bg` | `--bid-bg` | Fundo da aplicação |
| `--surface` | `--bid-surface` | Cartões e campos |
| `--surface-2` | `--bid-surface-subtle` | Superfície secundária |
| `--ink` | `--bid-text` | Texto principal |
| `--muted` | `--bid-muted` | Texto secundário legível |
| `--faint` | `--bid-muted` ou decoração | Não transportar automaticamente o baixo contraste |
| `--accent` | `--bid-action` | Ação principal; não usar como cor universal de status |
| `--accent-ink` | `--bid-on-action` | Texto sobre ação, não sobre fundo suave |
| `--accent-deep` | `--bid-text` ou `--bid-focus` | Separar links de indicador de foco |
| `--accent-soft` | `--bid-selected` | Seleção e destaque neutro |
| `--line` | `--bid-border` ou `--bid-control-border` | Divisória e limite de controle têm requisitos distintos |
| `--ok`, `--warn`, `--danger` | `--bid-success`, `--bid-warning`, `--bid-danger` | Usar com seus fundos semânticos |
| `--ff` | `--bid-font` | Sora; lettering permanece SVG |

`tokens.json` usa um esquema simples próprio, organizado por tema e papel. Não é um arquivo DTCG e não promete importação direta em ferramentas de design sem adaptador.

## Contratos de componentes

### Marca

Usar assinatura horizontal a partir de 112 px de largura; em espaços menores, símbolo a partir de 24 px de altura. Se a marca já estiver nomeada pelo link ou botão pai, o SVG deve ser decorativo (`aria-hidden="true"`). Como imagem autônoma, usar `alt="bid"`; como link para início, o nome acessível é “bid, início”. Não acrescentar texto acessível duplicado.

### Button

Variantes primária e secundária. Altura 48 px, raio 8 px, espaço horizontal 20 px, texto 14–16 px e peso 600. Evitar mais de uma ação primária no mesmo grupo.

| Estado | Comportamento |
| --- | --- |
| Padrão | Fundo `action`, texto `on-action` |
| Hover | Fundo `action-hover` |
| Pressionado | Deslocamento máximo de 1 px; sem movimento com preferência reduzida |
| Foco | Anel de 3 px, afastado 3 px, cor `focus` |
| Carregando | Rótulo progressivo, `aria-busy`, bloquear repetição e anunciar status |
| Desabilitado | `disabled` nativo, sem hover ativo ou foco; explicar por que quando relevante |
| Falha | Reativar ação, preservar entrada e mostrar instrução de recuperação |

Botões só com ícone têm alvo de pelo menos 44 × 44 px e nome acessível. Links navegam; botões executam ações. Não transformar um `div` em controle por aparência.

### Field

Rótulo 14/20, peso 600; campo 16/24, altura mínima 48 px; ajuda 14/20. Borda de controle com contraste mínimo de 3:1 no par especificado. Rótulo e ajuda precisam de IDs estáveis. Erro usa mensagem visível, `aria-invalid` e `aria-describedby`; não depender da cor da borda. Não validar agressivamente durante a primeira digitação. Ao enviar, focar o primeiro campo inválido ou resumo acessível.

Autocomplete de categoria e fornecedor mantém entrada livre. Implementar padrão combobox com lista, seleção por teclado, Escape para fechar e anúncio do resultado. Sugestões nunca bloqueiam um novo valor.

### ProposalCard / ProposalRow

Ordem: fornecedor; categoria e obra; valor; versão e status. Valores usam números tabulares. Exibir nome completo na página de detalhe; não esconder informação essencial exclusivamente em tooltip. Se todo cartão navega, usar link único sem botões aninhados. Ações secundárias ficam fora desse link. Em 320 px, preço pode ocupar linha própria.

### StatusBadge

| Status | Tom | Texto indispensável |
| --- | --- | --- |
| Aberta | Neutro / seleção | Aberta |
| Em análise | Atenção | Em análise |
| Vencedora | Sucesso | Vencedora |
| Assinado | Sucesso | Assinado |
| Falha | Erro | Envio falhou |
| Arquivada | Neutro | Arquivada |

Badge não é botão. Não usar verde para qualquer valor menor: uma redução de preço só é positiva quando o contexto justificar. Preservar o significado de cada estado do domínio.

### Upload

Estados: vazio → arquivo selecionado → enviando → extraindo → conferência → salvo. Erros de envio e extração são etapas distintas. Mostrar nome e tamanho do arquivo; obter limites de formato/tamanho da configuração real, sem inventar limites no texto. Oferecer seletor nativo acessível por teclado; arrastar e soltar é complemento. Progresso percentual só quando houver medição real. Sem medição, usar rótulo da etapa. Não prometer envio offline até existir suporte.

### BottomNavigation

Ordem fixa: Propostas, Equalizar, Contratos, Obras. Texto de no mínimo 12 px; área de toque mínima 44 px. Ícone de 24 px com traço consistente de 1,75–2 px. Ativo usa fundo `selected`, texto `text` e `aria-current="page"`. Inativo usa `muted`. Respeitar safe-area inferior. A ação “Adicionar” fica no cabeçalho.

### Comparação e histórico

Comparações usam tabela semântica com cabeçalhos associados. Em telas estreitas, rolagem horizontal dentro de uma região nomeada e acessível por teclado. Valor, prazo e condições devem permanecer identificáveis; não transmitir vencedor apenas por preenchimento. Versões preservam ordem, data, responsável quando disponível e diferenças textuais. Apresentar a indicação de IA como recomendação sujeita à decisão humana.

### Dialog / Sheet

Título obrigatório, descrição quando necessária, botão de fechar nomeado. Foco inicial previsível, contenção de foco e restauração ao acionador. Escape fecha quando seguro. Confirmar exclusões com contexto do item, mantendo a regra de desfazer do produto. Sheet com raio de 20 px apenas nos cantos expostos. Fundo sobreposto não pode ser o único modo de fechar.

### Toast / Alert / EmptyState

Mensagens de sucesso usam `role="status"`; falhas urgentes podem usar `role="alert"`, sem anúncios duplicados. A ação Desfazer deve ter acesso por teclado e não ser a única forma de recuperar uma operação se o tempo de exibição impedir o uso. Em estados vazios, explicar o próximo passo com uma ação. Busca sem resultados oferece limpar filtros. Erros preservam os dados e oferecem nova tentativa.

## Ícones, imagens e movimento

Ícones de interface são lineares, com cantos discretamente arredondados e tamanhos de 20 ou 24 px. O símbolo da marca é preenchido e não deve ser convertido para o estilo dos ícones. Não usar emoji como ícone de produto. Ilustrações são opcionais e só entram se explicarem uma etapa. Evitar animação decorativa, gradientes na marca e sombras em cartões comuns. Overlays podem usar sombra leve para explicar a sobreposição.

## Escopo de validação

O relatório `contrast-report.json` calcula 26 pares (13 por tema) contra os limiares indicados. Bordas decorativas e estados desabilitados não são reivindicados como pares de texto aprovados. A referência é [WCAG 2.2](https://www.w3.org/TR/WCAG22/); a conformidade do produto depende de testes da implementação, conteúdo e fluxos completos.

Antes da adoção: testar tema claro/escuro, foco por teclado, zoom de 200%, largura de 320 px, nomes longos, valores grandes, carregamento, erro, leitor de tela e preferência por movimento reduzido. Conferir também os estados que não aparecem no catálogo.

## Governança

Geometria da marca vive nos SVGs mestres e no gerador. Tokens são a fonte dos valores; componentes não criam novas cores por conveniência. Registrar mudanças incompatíveis em nova versão. O manual visual, o guia editável e o catálogo devem ser regenerados juntos após mudanças de identidade.
