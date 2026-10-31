# Adendo ao CLAUDE.md — contratos na minuta padrão (M9–M14)

> Aplicar no `CLAUDE.md` da raiz no **M14** (ou antes, se preferir). Até lá, este adendo vale para todo trabalho em contratos, papéis na obra e assinatura.

## Documentos
- `docs/contratos/PRD-contratos.md` — regras RC-01…RC-17, papéis, estados, questões abertas.
- `docs/contratos/SPEC-contratos.md` — dados, RLS, RPCs, core, servidor, IA, assinatura.
- `docs/contratos/PLAN-contratos.md` — milestones M9–M14.
- `docs/contratos/_privado/` — modelo .docx, catálogo de cláusulas, biblioteca, dicionário (`MODELO-MINUTA.md`). **Fora do git.**
- `docs/contratos/ref/` — motor de referência e script de tokenização (especificação executável).
- `docs/contratos/_privado/prototipo-contrato.html` — protótipo navegável aprovado.

## Regra 13 (substitui a atual)
13. **Acesso é por obra, com papéis.** Quem cria a obra é o **dono**; os demais entram por convite aceito com papel **gestor** ou **colaborador** (`obra_convites.papel`). Dono e gestor gerenciam (aprovam e emitem contratos, apagam propostas/equalizações/contratos, convidam e trocam papéis). Colaborador sobe, equaliza, monta contrato e envia para validação — **não aprova, não emite, não apaga**. Só o dono apaga a obra (até decisão Q1). Use `papel_obra()` / `gerencia_obra()`; não reintroduza acesso por "membro da organização".

## Regras novas
14. **Contrato oficial vem do modelo versionado.** O texto da minuta mora em `contrato_modelos` (catálogo + .docx em bucket privado). Nunca escreva texto de cláusula no código, em migration ou em `seed.sql`.
15. **Um documento resolvido, dois formatos.** .docx e PDF saem do mesmo `DocumentoResolvido` (core); o hash é desse JSON canônico. Telas não montam texto de contrato.
16. **Todo item tem origem.** `padrao | parametro | proposta | bloco | variante`. Variante exige justificativa; variante que reduz proteção exige aprovação explícita de dono/gestor.
17. **Revisão por IA é obrigatória e não pode ser desligada.** Sempre compara minuta × proposta e aponta conflitos; refaz quando o conteúdo muda; achado alto sem resolução bloqueia o envio. A IA não aprova nem altera o contrato.
18. **Aprovação vale para um hash.** Editar depois de aprovado volta a rascunho. Emitido é imutável; numeração `CT-AAAA-NNN` só na emissão, no banco, em transação.
19. **Equalização não vai para o contrato** (sigilo entre concorrentes, cláusula 21.1). O dossiê usa só os dados da vencedora.
20. **Dados fictícios em testes.** Enquanto o repositório for público, casos de teste, seeds e fixtures usam só dados inventados (`docs/contratos/casos/`). Nunca copie contrato, proposta, CNPJ ou nome real para o repo.

## Vocabulário adicional
minuta, modelo, quadro-resumo, item de cláusula, variante, bloco (condição específica), dossiê, revisão IA, achado (conflito/lacuna/risco), validação, emissão, signatário, testemunha, ratificação, prevalência.
