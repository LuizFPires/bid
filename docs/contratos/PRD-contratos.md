# PRD — Contratos de empreitada a partir da minuta padrão (M9–M14)

> Complementa `docs/PRD.md`. Onde este documento e o PRD geral divergirem sobre **contratos, papéis na obra e assinatura**, vale este documento (e o PRD geral deve ser atualizado no mesmo PR, como manda o CLAUDE.md).
> Referência visual e de fluxo: `docs/contratos/_privado/prototipo-contrato.html` (protótipo navegável aprovado em 31/10/2026).

---

## 1. Problema

Hoje (M6/M7) o bid gera um contrato **simples**: 7 cláusulas montadas pelo `core.gerarClausulas`, PDF via `@react-pdf/renderer`, duas partes (contratante e contratada). Na operação real a empresa usa uma **minuta padrão de empreitada** (22 cláusulas, quadro-resumo, Anexo I com condições particulares e planilha, Anexo II com declaração de capacidade), com **três partes** — CONTRATANTE (dono do empreendimento / SPE), CONTRATADA (empreiteira) e CONSTRUTORA (AMPLA ou Clássica, que administra a obra) — e cada contrato precisa de **parametrizações** que hoje são feitas à mão no Word:

- qualificação completa das partes (com CEP, nome curto e **vários signatários**);
- quadro-resumo com regime, valor, prazos, medições, retenções, materiais, faturamento direto, garantias, seguros e marcos;
- planilha de preços com **código, grupos** e até **4 casas decimais** no preço unitário;
- **condições específicas** por tipo de serviço (exclusões, escavação/escoramento, resíduos, ensaios, licenças, faturamento direto com insumo de referência etc.);
- quando a proposta vira anexo (Anexo III) e foi dirigida a outra empresa, **ratificação** e regra de **prevalência**;
- **variantes negociadas** de cláusulas (ex.: rescisão por conveniência, prazo de pleitos, preço de adicionais), que **reduzem proteção** e precisam ser **visíveis e aprovadas**.

Erros nessa montagem custam dinheiro (preço errado, cláusula que contradiz a proposta, proteção removida sem ninguém notar). O bid já tem a proposta lida pela IA e a equalização; falta ligar isso à minuta oficial com conferência obrigatória.

## 2. Objetivo

Gerar, a partir da proposta vencedora, o **contrato oficial na minuta padrão**, com:

1. **Dossiê** do contrato montado automaticamente (proposta extraída + equalização + cadastros), conferido pelo usuário;
2. **Assistente em etapas** para completar o que a IA não sabe (quadro, partes, planilha, condições específicas);
3. **Revisão obrigatória por IA** que **sempre** aponta conflitos entre a minuta e a proposta;
4. **Validação** por quem tem poder (dono ou gestor da obra) antes de emitir;
5. **Emissão** do documento oficial com **download em .docx e em PDF**;
6. **Assinatura das três partes** (vários signatários por parte, testemunhas opcionais) com a trilha de auditoria atual.

### Métricas de sucesso
- Tempo da vencedora ao contrato emitido: **< 30 min** (hoje: horas no Word).
- **0** contratos emitidos com marcador sem preencher (`[A PREENCHER]`) — garantido por bloqueio.
- **100 %** dos contratos emitidos com revisão de IA registrada e conflitos tratados (aceitos com justificativa ou corrigidos).
- Variantes que reduzem proteção: **100 %** com justificativa e aprovação registradas.

## 3. Papéis por obra (decisão do usuário, 31/10/2026)

Substitui o modelo "dono + convidados iguais" da regra 13 por **três papéis na obra**. O dono convida membros escolhendo o papel.

| Ação | Dono | Gestor | Colaborador |
|---|:-:|:-:|:-:|
| Ver a obra e tudo dentro dela | ✅ | ✅ | ✅ |
| Subir propostas e novas versões | ✅ | ✅ | ✅ |
| Equalizar e definir vencedora | ✅ | ✅ | ✅ |
| Montar o contrato (dossiê, assistente, minuta) | ✅ | ✅ | ✅ |
| Enviar o contrato para validação | ✅ | ✅ | ✅ |
| **Aprovar / devolver** o contrato | ✅ | ✅ | ❌ |
| **Emitir** (versão final, numeração) e enviar para assinatura | ✅ | ✅ | ❌ |
| Aprovar variantes que reduzem proteção | ✅ | ✅ | ❌ |
| **Apagar** propostas, equalizações e contratos | ✅ | ✅ | ❌ |
| Convidar membros, mudar papel, remover acesso | ✅ | ✅ (*) | ❌ |
| Apagar a obra | ✅ | ❓ (Q1) | ❌ |
| Cadastros (partes, fornecedores, modelo da minuta) | ✅ | ✅ | ver só |

(*) Gestor não remove nem rebaixa o **dono**. O dono é sempre único (`obras.criado_por`).

**Colaborador**: sobe propostas, equaliza, monta o contrato e **envia para validação**; não aprova, não emite, não apaga.

> Convidados que já existem (convites aceitos antes desta mudança) entram como **colaborador** — preserva exatamente o que podem fazer hoje (hoje convidado não apaga nada). O dono promove a gestor quem quiser.

## 4. Fluxo

```
Vencedora ─► [1 Dossiê] ─► [2 Partes] ─► [3 Quadro-resumo] ─► [4 Planilha] ─► [5 Condições específicas]
          ─► [6 Minuta + variantes] ─► [7 Revisão IA (obrigatória)] ─► Enviar p/ validação
          ─► (dono/gestor) Aprovar | Devolver ─► Emitir (nº CT-AAAA-NNN, .docx + PDF)
          ─► Enviar p/ assinatura ─► Assinado (todas as partes)
```

1. **Dossiê** — ao criar o contrato a partir da vencedora, o servidor monta e **fotografa** (imutável) o dossiê: dados extraídos da proposta (fornecedor, valor, prazo, pagamento, garantia, itens, alertas), a análise da equalização daquele certame (escopo incluído/ausente/parcial, divergências, riscos) e os cadastros da obra. O usuário vê de onde veio cada informação.
2. **Partes** — CONTRATANTE e CONSTRUTORA vêm da **obra** (cadastro); a CONTRATADA vem do **fornecedor** (cadastro por CNPJ, criado/atualizado a partir da proposta). Qualificação completa, nome curto e **signatários** (1..n por parte).
3. **Quadro-resumo** — campos do quadro (regime, valor, prazos, medição, retenção, antecipação, materiais, faturamento direto, garantia, seguros, marcos, representante, documentos). Pré-preenchidos pelo dossiê; o usuário confirma.
4. **Planilha** — itens da proposta (código, grupo, descrição, unidade, quantidade, preço unitário até 4 casas, total). Importação de .xlsx. Soma deve fechar com o valor do contrato.
5. **Condições específicas** — biblioteca de **blocos** (por tipo de serviço) que entram no Anexo I e, quando o bloco pede, alteram itens de cláusula (ex.: faturamento direto com insumo de referência).
6. **Minuta + variantes** — texto final de cada item, com **origem** marcada: padrão, parâmetro, proposta, bloco, variante. Editar um item padrão vira **variante** e exige **justificativa**. Variantes do catálogo que reduzem proteção ficam em destaque.
7. **Revisão por IA (obrigatória)** — a IA lê o contrato montado **e a proposta** e devolve **conflitos** (minuta × proposta), **lacunas** e **riscos**. Cada conflito precisa ser **resolvido** (corrigido no contrato) ou **aceito com justificativa**. Sem revisão concluída sobre a versão atual, não há envio para validação.
8. **Validação** — dono/gestor aprova (o hash do conteúdo aprovado é gravado) ou devolve com comentário. Qualquer edição depois da aprovação **invalida** a aprovação (volta a rascunho).
9. **Emissão** — gera número `CT-AAAA-NNN`, a versão **final** (.docx sem destaques amarelos + PDF) e grava ambos. A partir daqui o conteúdo é **imutável**; correção = cancelar e gerar nova versão (fora do escopo desta fase: aditivos).
10. **Assinatura** — cada signatário de cada parte assina (no app, presencialmente, ou por link/WhatsApp). Testemunhas são opcionais (o contrato admite assinatura eletrônica sem testemunhas — art. 784, §4º, CPC). Contrato fica **assinado** quando **todos os signatários obrigatórios** das três partes assinam.

## 5. Regras de negócio (RC-xx)

- **RC-01** O contrato nasce **só** da proposta vencedora de um certame adjudicado (mantém M6). Um contrato ativo por proposta.
- **RC-02** O **dossiê é fotografado** na criação (`contratos.dossie`). Mudanças posteriores na proposta não alteram o contrato (regra 8); o app avisa "a proposta mudou depois do dossiê" e oferece **atualizar o dossiê** (só em rascunho/devolvido).
- **RC-03** O **valor do contrato** é sempre a soma da planilha e é calculado no servidor; divergência com o valor da proposta gera conflito obrigatório na revisão.
- **RC-04** Modelo único de minuta para **AMPLA e Clássica**; a construtora da obra define **logo do cabeçalho** e dados da parte CONSTRUTORA.
- **RC-05** Todo item de cláusula tem **origem** (`padrao | parametro | proposta | bloco | variante`). `variante` exige **justificativa** e guarda o **texto padrão** para comparação.
- **RC-06** Variantes marcadas como **reduzem proteção** (catálogo) exigem aprovação de dono/gestor **item a item** — aprovar o contrato inteiro inclui essa aprovação explícita.
- **RC-07** **Revisão por IA é obrigatória** antes de enviar para validação e é **refeita** se o conteúdo mudar (comparação por hash). A IA **sempre** compara minuta × proposta e aponta divergências; isso não pode ser desligado.
- **RC-08** Conflitos de severidade **alta** bloqueiam o envio até serem **corrigidos** ou **aceitos com justificativa** por quem envia; a aprovação final é de dono/gestor.
- **RC-09** Não se emite com marcador vazio: o motor devolve `faltando[]` e a emissão é recusada se não estiver vazia.
- **RC-10** Aprovação vale para um **hash** do documento resolvido. Editar depois de aprovado → status volta a `rascunho` e a aprovação fica registrada como **superada**.
- **RC-11** Numeração `CT-AAAA-NNN` **por organização e ano**, sequencial, atribuída **na emissão** (não no rascunho), sem buracos por corrida (transação).
- **RC-12** Download: **.docx** (documento oficial editável) e **PDF**. Antes da emissão, ambos saem como **minuta** (aviso vermelho "MINUTA PARA CONFERÊNCIA — NÃO VÁLIDA PARA ASSINATURA" e destaques amarelos). Depois, versão final.
- **RC-13** A assinatura é aplicada sobre o **PDF emitido**; o .docx emitido e o PDF são gerados do **mesmo documento resolvido** e têm seus hashes gravados.
- **RC-14** Proposta anexada (Anexo III) **dirigida a outra empresa** (emitente/destinatário diferentes da CONTRATADA/CONTRATANTE): o assistente exige o **bloco de ratificação** (itens 1.3, 1.4 e 22.4) e a regra de prevalência.
- **RC-15** **Equalização não vai para o contrato.** O PDF de M6 anexa a equalização (Anexo II), mas a equalização compara concorrentes e o contrato vai para a contratada — conflita com o sigilo da cláusula 21.1. Nesta fase o anexo de equalização **sai** do contrato; a equalização continua só no app e no relatório interno. (Q3 — confirmar.)
- **RC-16** Dados de terceiros: CNPJ/CPF validados por dígito; e-mails e telefones de signatários ficam no contrato apenas para envio de link.
- **RC-17** Exclusão: rascunho/devolvido/aprovado podem ser apagados (lógico) por dono/gestor; **emitido, enviado e assinado não se apagam** (cancelar emitido é ação própria, com motivo, e mantém o registro).

## 6. Estados do contrato

| Estado | Quem leva até ele | Pode editar? | Observação |
|---|---|:-:|---|
| `rascunho` | criação; edição após aprovação | ✅ | |
| `em_validacao` | qualquer papel, com revisão IA atual concluída | ❌ | aguardando dono/gestor |
| `devolvido` | dono/gestor | ✅ | com comentário obrigatório |
| `aprovado` | dono/gestor | ✅ (volta a rascunho) | hash aprovado gravado |
| `emitido` | dono/gestor | ❌ | número, .docx e PDF finais |
| `enviado` | dono/gestor | ❌ | links de assinatura gerados |
| `assinado` | servidor (último signatário obrigatório) | ❌ | |
| `cancelado` | dono/gestor (de `emitido`/`enviado`) | ❌ | motivo obrigatório |

Contratos antigos (M6): `rascunho` continua; `enviado`/`assinado` continuam válidos com `modelo_versao = null` (modo legado, ver SPEC §12).

## 7. Revisão por IA — o que ela devolve

- **Conflitos** (minuta × proposta): ex. prazo do quadro 60 dias × proposta 90 dias; pagamento 30 dd × proposta "50 % antecipado"; reajuste na proposta × cláusula 4.3 irreajustável; exclusões da proposta que a minuta trata como incluídas; garantia menor; hora técnica cobrada à parte; validade da proposta vencida; condições da proposta dirigidas a outra empresa.
- **Lacunas**: campos obrigatórios vazios; bloco esperado e ausente (ex.: proposta cita faturamento direto e o quadro diz "não há").
- **Riscos**: variantes que reduzem proteção; alertas da leitura da proposta (texto oculto, somas que não fecham); escopo ausente/parcial apontado na equalização.
- Cada achado: severidade (alta/média/baixa), item do contrato, trecho da proposta (citação curta), explicação e **sugestão de texto**. O usuário pode **aplicar a sugestão** (vira variante com justificativa pré-preenchida "sugestão da revisão IA") ou **aceitar o conflito** com justificativa.
- A IA **não decide**: não aprova nem altera o contrato sozinha (regra 6 aplicada ao contrato).

## 8. Fora de escopo (desta fase)

- Aditivos contratuais e medições/pagamentos (financeiro).
- Assinatura ICP-Brasil (regra 9 continua).
- Editor WYSIWYG do .docx dentro do app; edição é por item de cláusula.
- Versões diferentes da minuta por construtora (decisão: modelo único).
- Envio por e-mail transacional (continua link + WhatsApp).
- Conversão .docx→PDF com LibreOffice/serviço externo (ver decisão D3 no SPEC).

## 9. Decisões registradas

- **D1** (31/10/2026) Download em .docx **e** PDF.
- **D2** (31/10/2026) Papéis por obra: dono, gestor, colaborador (tabela §3).
- **D3** (31/10/2026) AMPLA e Clássica usam o **mesmo** modelo de minuta.
- **D4** (31/10/2026) A IA **sempre** aponta conflitos entre minuta e proposta (revisão obrigatória).

## 10. Questões abertas (registrar a resposta em "Decisões" do PLAN.md)

- **Q1** Gestor pode **apagar a obra**? Hoje só o dono (regra 13). **Padrão até decidir: só o dono.**
- **Q2** **Autoaprovação**: quem montou e enviou pode aprovar o próprio contrato (se for dono/gestor)? **Padrão: permite, com aviso** "você está aprovando um contrato que você mesmo enviou" e registro no evento.
- **Q3** Confirmar que a **equalização sai do contrato** (RC-15).
- **Q4** Testemunhas: opcionais por contrato (padrão: desligadas)?
