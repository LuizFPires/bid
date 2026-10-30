# bid · Manual da marca e guidelines

Versão 1.0 · 30 de outubro de 2026

## 01 · Essência

### Clareza para decidir.

**O que é o bid.** Um acervo de propostas de obra que organiza documentos, preserva versões e apoia a comparação até a contratação. Armazenar vem primeiro; comparar e contratar ampliam esse valor.

**Personalidade.** Preciso, sereno e confiável. A sofisticação aparece no espaço, na legibilidade e na consistência. Cada elemento precisa ajudar a encontrar, entender ou decidir.

**Princípios.** Uma ação principal por contexto. Informações essenciais primeiro. Formas simples. Cor com função. A marca acompanha o conteúdo sem competir com ele.

## 02 · Assinatura visual

### Duas folhas. Um acervo.

**Conceito.** Duas folhas sobrepostas representam propostas e suas versões. O recorte diagonal da folha frontal conversa com o terminal do “d”. O símbolo é preenchido e funciona em uma única cor.

**Composição oficial.** Símbolo à esquerda e lettering “bid” à direita. A palavra é um desenho vetorial próprio inspirado na direção tipográfica aprovada: nunca redigitar para reconstruir a marca.

**Versões.** Horizontal para cabeçalhos e documentos; lettering isolado quando a marca já estiver contextualizada; símbolo para ícone do aplicativo, avatar e favicon. Usar os SVGs mestres.

## 03 · Construção e respiro

### Proporção é identidade.

**Geometria.** Símbolo: 58 × 64 unidades. Folha traseira com espessura de 8 unidades; folha frontal inicia em (14,14); canto recortado de 9 unidades. Espaço mínimo entre as folhas: 6 unidades.

**Assinatura horizontal.** Prancheta: 281 × 99 unidades. Símbolo em (0,15); lettering em (90,0). O intervalo visível entre símbolo e palavra é de 32 unidades. Escalar sempre o conjunto proporcionalmente.

**Área de proteção e mínimo.** Defina x como 16 unidades da prancheta. Preserve ao menos x em todos os lados. Digital: assinatura com 112 px de largura; lettering com 64 px; símbolo com 24 px de altura. Impressão: 28 mm, 16 mm e 6 mm, respectivamente. Para favicon de 16 px, conferir a rasterização final.

## 04 · Aplicação

### Uma marca, poucos gestos.

**Fundos.** Priorizar índigo sobre marfim ou branco; marfim ou branco sobre índigo. Em fotografia, reservar uma área lisa ou aplicar uma base sólida com espaço de proteção.

**O que preservar.** Proporção, distância entre as formas, corte diagonal e cor única. Usar o ícone com margem interna generosa. A forma quadrada arredondada pertence ao ícone do app, não à assinatura horizontal.

**Evitar.** Esticar, inclinar, contornar, adicionar folhas, usar degradê, sombra ou efeito metálico; trocar a fonte do lettering; colorir símbolo e palavra de forma independente; aplicar em fundos sem contraste.

## 05 · Cores

### Índigo profundo. Marfim.

**Paleta principal.** Índigo #171B31: marca, texto e ação principal no tema claro. Marfim #F6F5F1: fundo e respiro. Branco #FFFFFF: superfícies. A identidade é essencialmente monocromática.

**Hierarquia.** Texto secundário #626577. Divisórias #DCDDDF são decorativas; controles usam borda #858899. Foco #4D5FA8. Não usar o tom claro de divisória para identificar um campo sozinho.

**Semântica.** Verde identifica sucesso; âmbar, atenção; vermelho, erro ou atraso. Sempre acompanhar de texto e, quando útil, ícone. Estados de negócio precisam de nomes explícitos, não apenas pontos coloridos.

## 06 · Tipografia

### Sora, com precisão.

**Família de interface.** Sora é a fonte de títulos, textos, controles e números. Usar os arquivos locais incluídos e manter OFL.txt na distribuição. Fallback: system-ui, sans-serif. O lettering da marca permanece vetorial.

**Escala.** Display 48/56, peso 600; título de página 28/36, 600; seção 20/28, 600; corpo 16/24, 400; apoio 14/20, 400; rótulo 14/20, 600; legenda e status 12/16, 500. Os pares indicam tamanho/entrelinha em px.

**Regras.** Usar caixa de frase, evitar textos longos em maiúsculas. Números tabulares em preços e comparações. Campos em 16 px. Não reduzir textos essenciais abaixo de 14 px; 12 px é reservado a metadados curtos.

## 07 · Estrutura

### Espaço para o conteúdo.

**Ritmo.** Escala de espaçamento: 4, 8, 12, 16, 20, 24, 32, 48 e 64 px. Conteúdo mobile com margem de 20 px; cartões com 24 px; distância entre seções de 32 px. Agrupar antes de acrescentar divisórias.

**Forma e movimento.** Raio de controles: 8 px; cartões: 12 px; painéis: 20 px; badges: 999 px. Sombras apenas para elementos flutuantes. Transições de 120 a 180 ms. Respeitar preferência por movimento reduzido.

**Responsividade.** Preservar o modelo atual: conteúdo do app com largura máxima de 440 px e navegação inferior. Em 320 px, empilhar preço e metadados quando necessário. Respeitar safe-area. Tabelas comparativas podem rolar em região própria, sem provocar rolagem horizontal na página.

## 08 · Componentes

### Consistência na ação.

**Botões.** Altura padrão de 48 px; área de toque mínima de 44 × 44 px. Primário preenchido; secundário com contorno; ação textual com sublinhado quando link. Estados: padrão, hover, pressionado, foco, desabilitado e carregando.

**Formulários e upload.** Rótulo persistente acima do campo. Placeholder é exemplo, nunca substituto do rótulo. Erro junto ao campo com aria-describedby e aria-invalid. Upload deve oferecer seletor de arquivo por teclado, progresso, cancelamento quando possível e nova tentativa.

**Cartões e navegação.** Cartão de proposta: fornecedor, categoria/obra, versão, status e valor. Navegação: Propostas, Equalizar, Contratos, Obras. Item ativo usa texto, forma e aria-current. A ação de criar permanece no topo à direita.

## 09 · Estados e linguagem

### Confiança em cada etapa.

**Vazio, carregamento e erro.** Vazio: “Seu acervo começa aqui.” + “Adicionar proposta”. Busca vazia: “Nenhuma proposta encontrada.” + “Limpar filtros”. Leitura: “Lendo proposta…” com anúncio de status. Erro: “Não foi possível enviar. Tente novamente.” Preservar os dados digitados.

**IA e decisões.** Apresentar extração como informação a conferir: “Confira os dados antes de salvar”. Recomendação de comparação não é uma decisão automática. A ação “Definir vencedora” deve nomear o fornecedor e oferecer “Desfazer” no fluxo previsto.

**Tom e formatos.** Português brasileiro, frases diretas, sem jargão desnecessário. “Salvar proposta”, “Adicionar versão”, “Gerar contrato”. Valores em R$ 12.450,00; datas em 29/10/2026 quando a precisão for necessária. Não atribuir erro ao usuário.

## 10 · Acessibilidade

### Legível. Operável. Claro.

**Contraste.** Texto normal: ao menos 4,5:1; texto grande e elementos essenciais não textuais: 3:1. Os pares especificados foram calculados nos dois temas. Divisórias decorativas não substituem contornos de controles.

**Interação.** Foco visível de 3 px com afastamento de 3 px; operação por teclado; nome acessível em botões com ícone. Modais precisam de foco inicial, contenção de foco e retorno ao acionador. Status dinâmico usa região viva adequada.

**Validação do produto.** Verificar zoom de 200%, fluxo a 320 px, leitor de tela, textos longos, estados de erro e alvos de toque. A aprovação dos tokens não equivale a uma auditoria completa do aplicativo. Garantir que ações temporárias também tenham alternativa persistente quando necessário.

## 11 · Entrega e adoção

### Uma fonte de verdade.

**Arquivos.** assets/: símbolos, lettering e assinaturas em SVG, versões índigo, marfim, preto e branco; ícone do app. fonts/: Sora e licença. tokens.json e tokens.css: valores e componentes de referência. index.html: guia visual local.

**Status da versão 1.0.** Direção visual aprovada nesta conversa; geometria normalizada neste kit. O manual e o catálogo estão prontos para uso. O aplicativo atual ainda utiliza os tokens e o símbolo anteriores: a migração de produção é uma etapa separada.

**Checklist de adoção.** Aplicar Logo.tsx e ícone PWA; carregar Sora localmente; mapear tokens antigos; revisar contrastes e estados; conferir login e navegação em ambos os temas; gerar favicons; atualizar screenshots; validar no celular antes da publicação.

## Referências

- Sora e licença: https://github.com/google/fonts/tree/main/ofl/sora
- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- Contraste: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html

As proporções e mínimos da marca são regras deste projeto, não exigências externas. Os dados de proposta no catálogo são demonstrativos.
