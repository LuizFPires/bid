# PLAN — Contratos na minuta padrão · M9 a M14

> Continua o `docs/PLAN.md` (M0–M8). Ao concluir cada milestone, **copie o bloco para o PLAN.md principal** (ou referencie este arquivo) e registre desvios em "Decisões" do PLAN.md.
> Regras gerais valem: um item por commit (pt-BR, imperativo); migration com RLS + pgTAP no mesmo PR; regra de domínio só no `core` com teste; revisão independente ao fim de cada milestone (como M4–M7).
> Ordem obrigatória: M9 → M10 → M11 → M12 → M13 → M14. M11 e parte do M12 podem andar em paralelo depois do M10.

---

## M9 · Papéis na obra, cadastros e modelo da minuta (fundação)

**Por quê primeiro:** tudo depois depende de saber quem pode aprovar/apagar e de ter partes, fornecedores e o modelo carregado.

- [x] Migration `papeis_obra`: `obra_convites.papel` (backfill `colaborador`), `papel_obra()`, `gerencia_obra()`, `gerencia_contrato/proposta/certame()` (SPEC §2.1).
- [x] Guards de exclusão (proposta, certame, equalização, contrato) passam a usar `gerencia_obra`; `apagar_obra` continua só dono.
- [x] RPCs: `convidar_para_obra(..., p_papel)`, `mudar_papel_obra`, `remover_acesso_obra` (dono ou gestor), `listar_acesso_obra` com papel.
- [x] pgTAP `papeis_obra.test.sql` com a matriz completa do PRD §3.
- [x] `core/contrato/fluxo.ts` (`podeAcao(status, papel, acao)`) + testes; hook `usePapelObra(obraId)`.
- [x] UI Pessoas da obra: escolher papel ao convidar, trocar papel, selos Dono/Gestor/Colaborador; esconder ações de apagar para colaborador em propostas, equalizações e contratos.
- [x] Migration `cadastros_contrato`: colunas em `obras` (endereço, CNO, foro, contratante, construtora); `partes`, `parte_signatarios`, `fornecedores`, `fornecedor_signatarios` + RLS + pgTAP.
- [x] `core/contrato/qualificacao.ts` + testes (1/2/3 signatários, nome curto, CEP); validação CNPJ/CPF/CNO portada do motor de referência (`docs/contratos/ref/` e piloto).
- [x] Tela **Cadastros** (menu do perfil): partes (contratante/construtora com marca AMPLA/Clássica) e fornecedores, com signatários; obra ganha campos endereço/CNO/foro e escolha de contratante e construtora.
- [x] Migration `contrato_modelos` (+ `modelo_blocos`, `modelo_variantes`, bucket privado `modelos`) + RLS + pgTAP.
- [x] Script local `scripts/seed-modelo-contrato.mjs` (lê `docs/contratos/_privado/`, sobe .docx e logos, insere catálogo/blocos/variantes; idempotente por `codigo+versao`). Documentar no README do supabase como rodar. **Nada de texto da minuta no git.**
- **Aceite:** dono convida um gestor e um colaborador; o colaborador não vê nem consegue (via API) apagar proposta/equalização/contrato; o gestor convida, troca papel e apaga; pgTAP verde. Uma obra tem contratante e construtora cadastradas; o modelo 1.0 está ativo na org (via script).

## M10 · Dossiê, assistente (partes e quadro) e revisão por IA obrigatória

- [x] Migration `contratos_v2` (SPEC §2.4): status novos, colunas, `contrato_itens_clausula`, `contrato_planilha`, `contrato_blocos`, `contrato_signatarios`, `contrato_numeracao`, triggers (campos do servidor, edição por status, invalidação de aprovação, valor = soma) + pgTAP `contratos_v2.test.sql`.
- [x] `core/contrato/tipos.ts`, `dossie.ts` (`montarDossie`), `parametros.ts` (`QUADRO` com os campos de `_privado/MODELO-MINUTA.md` §2 + `parametrosIniciais`) + testes com o caso fictício.
- [x] RPC `criar_contrato_v2` (idempotente) e `salvar_contrato` (patch em lote) + `atualizar_dossie` (service_role).
- [x] Rota `/api/contracts/dossie`: monta dossiê (proposta extraída + alertas + análise da equalização **só da vencedora**) e o estado inicial do contrato.
- [x] Botão "Gerar contrato" (proposta vencedora / "+ Contrato") cria v2 quando houver modelo ativo; senão legado.
- [x] Assistente — **Etapa 1 Dossiê** (o que veio da proposta e da equalização, alertas em destaque, "a proposta mudou: atualizar dossiê"), **Etapa 2 Partes** (qualificação gerada, escolher signatários, adicionar signatário avulso), **Etapa 3 Quadro-resumo** (campos com origem e ajuda).
- [x] Migration `contrato_revisao_validacao` (tabelas de revisão/achados/aprovações; só a parte de revisão neste milestone) + pgTAP.
- [x] `core/contrato/revisao.ts` (`normalizarRevisao`) + testes; `/api/ai/revisar-contrato` (SPEC §6) com cascata de tentativas e `BID_IA_MOCK`.
- [x] Tela **Revisão IA**: achados por severidade, aplicar sugestão (vira variante com justificativa pré-preenchida) ou aceitar com justificativa; estado "IA revisando…" que sobrevive à navegação; refazer quando o hash muda.
- [x] `core/contrato/hash.ts` + teste de igualdade cliente × servidor.
- **Aceite:** a partir de uma vencedora fictícia, o contrato v2 nasce com dossiê e quadro pré-preenchidos; a revisão IA roda e aponta, no caso fictício com prazo 60 × 90 dias, um **conflito alto** no `quadro.q_prazo`; resolver o achado funciona; mudar um campo exige nova revisão.

## M11 · Planilha, condições específicas (blocos) e Anexo III

- [x] `core/contrato/planilha.ts` (código, grupos, 4 casas no unitário, total arredondado a 2, soma) + testes (incluir 1.800 × 152,4725).
- [x] **Etapa 4 Planilha**: tabela editável (mobile: faixa presa), linhas de grupo, importação .xlsx (colunas código/descrição/unidade/qtd/unitário; usar `xlsx` só no servidor ou parser leve — registrar decisão), aviso quando a soma ≠ valor da proposta.
- [x] `core/contrato/blocos.ts` (`sugerirBlocos` por categoria e por sinais do dossiê; `aplicarBloco` com parâmetros) + testes.
- [x] **Etapa 5 Condições específicas**: blocos sugeridos marcados, parâmetros do bloco (ex.: diesel de referência R$/L, emissor/aprovador da OC), edição dos itens do bloco; bloco pode alterar itens de cláusula (vira origem `bloco`).
- [x] Anexo III: escolher incluir a proposta como anexo (texto/título do anexo; documentos citados e não anexados); se emitente/destinatário divergem → bloco **ratificação** obrigatório (RC-14) e itens 1.3, 1.4, 22.4 trocados.
- [x] `anexos_lista`, `q_documentos_integrantes` derivados automaticamente.
- Nota: a tabela editável abre cada linha num drawer (mobile first) em vez de faixa presa; importação .xlsx/.csv por parser leve no cliente (`apps/web/src/lib/xlsx.ts`, fflate) — decisão em docs/PLAN.md.
- **Aceite:** contrato fictício de fundações com 2 grupos e 3 itens soma R$ 312.450,00; blocos "Fundações — escavação e escoramento" e "Ensaios" entram no Anexo I; incluir Anexo III de proposta dirigida a outra empresa força a ratificação.

## M12 · Minuta, variantes, motor .docx/PDF e validação

- [x] `core/contrato/clausulas-v2.ts` (itens iniciais do catálogo + parâmetros + blocos; `aplicarVariante`, `suprimir`, `restaurarPadrao`, item extra) + testes.
- [x] `core/contrato/resolver.ts` (`resolverDocumento`) e `validar.ts` (`pendencias`) + teste com snapshot do caso fictício.
- [x] `packages/server/src/contrato-docx.ts`: porta do motor de referência (`docs/contratos/ref/motor-docx.mjs`) com fflate; troca de logo por marca; teste com `skipIf` sem o modelo privado.
- [x] `packages/server/src/contrato-pdf.ts`: PDF com @react-pdf do mesmo documento resolvido; teste de paridade de texto com o .docx.
- [x] Rota `/api/contracts/preview` (minuta .docx/PDF com aviso; grava `conteudo_hash` e `_faltando`).
- [x] **Etapa 6 Minuta**: lista de cláusulas → itens com selo de origem; "ver padrão" (diff simples); editar = variante com justificativa; catálogo de variantes negociadas por item (com explicação do que se perde; `reduz_protecao` em vermelho); suprimir; incluir item extra.
- [x] **Etapa 7 Enviar**: checklist de pendências do core + revisão IA atual concluída + achados altos resolvidos → `enviar_validacao`.
- [x] RPCs `enviar_validacao`, `devolver_contrato`, `aprovar_contrato` (com `autoaprovacao` e aviso — Q2) + pgTAP `contrato_fluxo.test.sql`.
- [x] Tela **Validação** (dono/gestor): resumo, variantes que reduzem proteção com "li e aprovo" por item, achados aceitos com justificativas, baixar minuta, Aprovar / Devolver (comentário obrigatório). Badge "aguardando validação" na aba Contratos.
- Notas: a paridade .docx × PDF é testada por continência do texto resolvido no .docx (o PDF só é renderizado e paginado — sem extrator de texto de PDF no repo); a validação OOXML no Word fica para a homologação com o modelo carregado. Parâmetros de cláusula são aplicados na resolução (origem `parametro`), não gravados em itens.
- **Aceite:** colaborador monta e envia; colaborador **não** consegue aprovar (UI e RPC); gestor aprova; editar depois da aprovação volta para rascunho; minuta .docx abre no Word sem erro (validar com o validador OOXML) e o PDF tem o mesmo texto.

## M13 · Emissão, numeração e assinatura das três partes

- [ ] RPC `emitir_contrato` (service_role) + numeração `CT-AAAA-NNN` por org/ano com `for update`; pgTAP com duas emissões concorrentes.
- [ ] Rota `/api/contracts/emitir`: final .docx (sem destaques) + PDF, hashes, Storage; `/api/contracts/download` (URL assinada).
- [ ] Migration `assinaturas_v2` (por signatário; partes contratante/contratada/construtora/testemunha) + pgTAP.
- [ ] `core.assinatura`: `todasObrigatoriasAssinaram` + testes; caixas de assinatura por signatário no PDF.
- [ ] `gerar_links_assinatura` (token por signatário) e compartilhar por WhatsApp; coleta presencial no app por dono/gestor.
- [ ] Página `/sign/:token` mostra o signatário e a parte; contrato vira `assinado` quando todos os obrigatórios assinam; integridade por `doc_hash` encadeado a partir do `pdf_hash` da emissão.
- [ ] `cancelar_contrato` com motivo; contrato emitido/assinado não se apaga.
- **Aceite:** emitir gera CT-2026-001; baixar .docx e PDF finais; 3 partes (construtora com 2 diretores) assinam — 2 por link, 2 no app; trilha completa; adulterar o PDF entre assinaturas é detectado.

## M14 · Legado, sigilo da equalização, métricas e polimento

- [ ] Contratos legados continuam funcionando (tela/PDF/assinatura atuais) — teste Playwright do caminho legado.
- [ ] Remover o anexo de equalização do PDF legado (RC-15), se Q3 confirmada.
- [ ] Métricas (consulta em `eventos`): tempo vencedora→emitido, % com variante que reduz proteção, achados por severidade, devoluções por contrato. Exibir em uma seção simples no perfil do gestor (ou só SQL documentado — decidir).
- [ ] Atualizar `docs/PRD.md` (perfis e contratos), `docs/SPEC.md` (modelo de dados) e regra 13 do `CLAUDE.md` (aplicar `docs/contratos/CLAUDE-contratos.md`).
- [ ] Playwright do fluxo feliz completo (SPEC §13).
- [ ] Revisão independente final (segurança/RLS, integridade de hash e assinatura, paridade docx×PDF).
- **Aceite:** fluxo ponta a ponta em produção com dados fictícios em homologação; documentação atualizada; nenhuma pendência alta da revisão independente.

---

## Decisões a registrar durante a execução
- Q1 gestor apagar obra · Q2 autoaprovação · Q3 equalização fora do contrato · Q4 testemunhas — respostas do usuário.
- Parser de .xlsx (biblioteca e onde roda).
- Fonte do PDF (Sora × Helvetica) e fidelidade visual aceita frente ao .docx.
- Logo AMPLA: arquivo fornecido pelo usuário (não está no pacote).
