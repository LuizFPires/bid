# CLAUDE.md — bid · propostas, equalização e contratos de obra

Guia para o Claude Code trabalhar neste repositório. Leia este arquivo inteiro antes de qualquer tarefa.

## O que é
O **bid** é um app (PWA, mobile first) para gerir **propostas de obra**: arquivar propostas por categoria de serviço, controlar versões, **equalizar** concorrentes com apoio de IA, definir a **proposta vencedora** e transformá-la em **contrato**, com **assinatura digital** no app ou por link (WhatsApp).

É um produto **independente** — não tem relação com o CONTRO. Não misture regras, dados ou design dos dois.

A hierarquia de prioridades do produto guia a UX e a ordem de construção:
1. Armazenamento de propostas (acervo) · 2. Controle de versões · 3. Equalização · 4. Vencedora → contrato (com assinatura digital).

## Documentos (fonte da verdade)
- `PRD.md`: o quê e por quê (comportamento, regras de negócio, fora de escopo).
- `SPEC.md`: como (stack, arquitetura, modelo de dados, IA, contrato, assinatura, infra).
- `PLAN.md`: ordem de execução por **milestones**, com checklists e critérios de aceite.
- `prototipo-bid.html`: o protótipo navegável aprovado — referência visual e de fluxo.

Antes de implementar: localize o milestone atual no PLAN.md, leia as seções correspondentes do PRD e do SPEC e só então codifique. Ao terminar um item, marque o checkbox no PLAN.md e registre desvios em "Decisões".

## Stack
React 18 + TypeScript + Vite (PWA) · TanStack Query · Supabase (Postgres, Auth, Storage, RLS, Edge Functions) · API da Anthropic (Claude) no servidor · HTML→PDF para contratos · Vitest + Playwright. Deploy na Vercel + Supabase.

## Estrutura do repositório
```
/apps/web            PWA (rotas, telas, componentes)
/apps/api            funções de servidor (extract, equalize, pdf, sign)  [ou /api no Vercel]
/packages/core       REGRAS DE DOMÍNIO puras e testadas (equalização, status, versões, cláusulas)
/packages/ui         tokens bid e componentes base
/supabase            migrations, policies (RLS), seed, functions
/docs                PRD.md, SPEC.md, PLAN.md, prototipo-bid.html
```

## Regras que não podem ser quebradas
1. **Regra de domínio só em `packages/core`.** Telas e servidor importam do core e nunca recalculam por conta própria. Toda função do core tem teste.
2. **Chave da Anthropic só no servidor.** Nenhuma chamada de IA parte do cliente. Extração e equalização passam por função de servidor.
3. **A IA lê a proposta.** No cadastro, o usuário informa só **obra + categoria** e anexa o arquivo; fornecedor, valor, prazo, pagamento, garantia e itens são **extraídos pela IA** e **confirmados** pelo usuário antes de salvar. Nunca grave sem confirmação.
4. **Categoria é campo livre.** Não crie cadastro fechado de categorias. O que se digita vira **sugestão** (`sugestoes`, ordenada por uso). Mesma lógica para fornecedor, obra e local.
5. **Proposta tem versões.** Revisar gera nova versão preservando as anteriores e seus arquivos. Registre variação de valor/prazo.
6. **Equalização é apoio, não decisão.** A recomendação da IA ajuda; a escolha da vencedora é do usuário.
7. **Vencedora pode ser direta.** Com proposta única (ou por decisão), marcar vencedora **sem equalizar** adjudica o certame e libera o contrato.
8. **Contrato é derivado da proposta.** Editar o contrato não altera a proposta; a proposta vencedora é anexo e fonte das cláusulas.
9. **Assinatura eletrônica simples.** Assinatura a dedo + trilha de auditoria (quem, quando, IP, hash). ICP-Brasil fora de escopo nesta fase. Link de assinatura: token forte, uso único, com expiração.
10. **Nada se apaga de fato.** Exclusão lógica (`deleted_at`) e tabela de `eventos` para propostas, versões, contratos e assinaturas.
11. **Ações destrutivas têm "Desfazer"** (toast de 5 s).
12. **RLS em tudo.** Migration sempre com política e teste de política no mesmo PR. Arquivos em buckets privados (URL assinada).

## Design system bid
- Identidade **índigo** (distinta do CONTRO): acento índigo, tinta quase-preta, fundo cinza claro; modo claro e escuro.
- **Logomarca:** símbolo de **propostas empilhadas em 3D** (três camadas), conforme o protótipo. Não redesenhe o símbolo.
- Vermelho só para **atraso/erro**; verde para sucesso/assinado; âmbar para atenção. Semântica sempre com texto + ícone, nunca só cor.
- Tipografia Nunito Sans (títulos 700–900, corpo 400–700, números 800). Mínimo 12 px.
- Botão primário: fundo índigo e texto escuro de alto contraste. Secundário: contorno. Alvos de toque ≥ 44 px. Contraste AA.
- Ícones lineares arredondados, inline SVG. Sem emoji na UI.
- Marca **"bid"** em minúsculas.
- Formato **celular**: no desktop, o app aparece como um aparelho centralizado; no telefone, tela cheia. Navegação por **abas inferiores** na ordem das prioridades: Propostas · Equalizar · Contratos · Obras. Ações de criar ("+") discretas no **topo à direita**, conforme a aba.
- UI **limpa**: pouca informação por tela, bastante respiro; linhas de lista com o essencial (nome, categoria·obra, valor).

## Linguagem e formatos
- Toda a UI em **pt-BR**.
- Datas "qua 21/10"; completa "quinta, 03/12/2026". Números no padrão brasileiro (1.234,56).
- Vocabulário: proposta, versão/revisão, certame (tomada de preços), categoria de serviço, fornecedor, equalização, vencedora, adjudicar, contrato, cláusula, anexo, assinatura, signatário.

## Performance
- Abrir o acervo/um certame < 1,5 s em 4G. Buscar o agregado em uma consulta e calcular derivados no cliente com o `core`. Sem N+1. Paginar históricos.
- Comprimir imagens de assinatura; upload de arquivos em segundo plano.

## Como trabalhar
- Commits pequenos, um item do PLAN por vez, mensagem em pt-BR no imperativo ("adiciona extração de proposta por IA").
- Mudou uma regra? Atualize PRD e SPEC no mesmo PR e registre em "Decisões" no PLAN.md.
- Dúvida de comportamento: o protótipo `prototipo-bid.html` é a referência. Se ele e o PRD divergirem, vale o PRD; pergunte se for ambíguo.
- Não invente dados reais de proposta/obra. Seeds de demonstração só em homologação.
- Segredos nunca no cliente nem no repositório.
