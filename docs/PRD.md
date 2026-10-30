# PRD.md — bid · propostas, equalização e contratos de obra

## Visão
O **bid** é um aplicativo (PWA, mobile first) para gerir o ciclo de **propostas de obra**: receber e arquivar propostas de fornecedores por categoria de serviço, controlar versões, **equalizar** concorrentes com apoio de IA, definir a **proposta vencedora** e transformá-la em **contrato**, com **assinatura digital** dentro ou fora do app.

É um produto independente (não tem relação com o CONTRO). Público: equipes de suprimentos/engenharia que conduzem tomadas de preço em obras.

## Problema
Hoje as propostas chegam soltas (e-mail, WhatsApp, papel), em formatos diferentes, e a comparação é manual, demorada e sujeita a erro (escopos que não estão no mesmo nível, transporte que um inclui e outro não). Depois, o contrato é redigido do zero, sem vínculo com a proposta vencedora, e assinado em papel. O bid resolve isso ponta a ponta.

## Hierarquia de prioridades do produto
A UX e a navegação seguem esta ordem (é a espinha dorsal do app):
1. **Armazenamento de propostas** — o acervo é a base. Busca por categoria, em uma obra ou em todo o sistema.
2. **Controle de versões** — cada proposta guarda suas revisões, com variação de valor/prazo e os arquivos originais.
3. **Equalização** — comparar concorrentes (e versões) no mesmo nível, com análise de IA.
4. **Vencedora → contrato** — a proposta vencedora vira contrato (anexo + base das cláusulas) e é assinada digitalmente.

## Perfis de usuário
- **Gestor / Comprador:** faz tudo — cadastra propostas, equaliza, define vencedora, gera e envia contrato para assinatura, assina pelo app.
- **Equipe:** tudo menos configurações sensíveis (ex.: excluir, alterar modelos de contrato). (Definir na RLS.)
- **Signatário externo (sem conta):** acessa apenas um contrato específico por **link tokenizado** (recebido por WhatsApp), para assinar.

## Escopo — funcionalidades

### 1. Armazenamento de propostas (acervo)
- Tela inicial é o **acervo** de propostas, com busca por fornecedor/categoria/obra.
- Filtro por **categoria de serviço** (campo livre, ver regra 2) e por **escopo**: *todo o sistema* ou *uma obra*.
- **Nova proposta** (ação discreta no topo à direita): o usuário informa **apenas obra + categoria** e **anexa o arquivo** (PDF/planilha). A **IA lê o arquivo** e extrai fornecedor, valor, prazo, condição de pagamento, garantia e itens; o usuário confere e arquiva.
- Cada proposta pertence a um **certame** (tomada de preços) daquela obra + categoria.
- No detalhe da proposta é possível **editar** os dados (fornecedor, valor, prazo, pagamento, garantia) — é correção da versão atual, não gera revisão — e **apagar** a proposta. Apagar é **exclusão lógica** com **Desfazer** (regra 10/11); só **gestor** apaga. Apagar a vencedora desadjudica o certame; não se apaga proposta que já virou contrato.

### 2. Controle de versões
- Uma proposta pode receber **novas versões/revisões** a qualquer momento.
- O histórico preserva, por versão: data, valor, prazo, observação e **arquivos originais**; o app mostra a variação de valor/prazo entre revisões.
- É possível **equalizar entre versões** de uma mesma proposta.

### 3. Equalização
- Lista de **equalizações** (certames) agrupada por estado: aguardando decisão, recebendo propostas, concluídas.
- **Iniciar equalização** (ação discreta no topo à direita): escolher **escopo** (em uma obra ou **entre obras**), **categoria** (campo livre) e as propostas que entram; abrir o comparativo.
- Comparativo em **tabela horizontal** (itens nas linhas, propostas nas colunas): **matriz de escopo** (cada item marcado ✓ incluído / ✗ ausente / ~ parcial por proposta) e, no rodapé, prazo, condição de pagamento, garantia e total; destaque de menor/maior. Dá para **definir a vencedora** a partir dessa tela (ação por proposta).
- **Análise com IA (Claude)**: lê planilhas/PDFs, normaliza escopos e **monta a matriz de escopo** (quais itens cada proposta inclui), aponta itens faltando, risco de custo extra e recomenda a melhor proposta (custo-benefício), com justificativa. A matriz de escopo vem dessa análise; antes de rodar a IA, a tabela mostra só prazo/pagamento/garantia/total.
- **Equalização entre obras:** reúne propostas da mesma categoria de N obras (histórico de preços).

### 4. Vencedora → contrato
- Definir a **proposta vencedora** de duas formas:
  - pela equalização (comparou e escolheu); ou
  - **direto na proposta** ("Definir como vencedora"), sem equalizar — caso de **proposta única**. Altera o status da proposta e marca o certame como adjudicado.
- A vencedora fica **liberada para contrato**.
- **Gerar contrato** a partir da vencedora (na proposta, no certame adjudicado ou pelo "+" em Contratos). O contrato:
  - vincula a proposta como **Anexo I** (e a equalização como anexo);
  - **pré-preenche as cláusulas** (objeto, preço, pagamento, prazo, garantia) com os dados da proposta;
  - mantém cláusulas padrão do modelo, editáveis.

### 5. Assinatura digital
- Seção **Assinaturas** no contrato, com as duas partes (Contratante e Contratada).
- **Assinar no app**: quadro para assinar **com o dedo**; a mesma assinatura é **replicada em todas as páginas** do documento.
- **Enviar para assinatura** (quem não usa o app): o app gera um **link**; o usuário compartilha por **WhatsApp**; a outra parte abre o link no navegador, **assina a dedo**, confirma, e o documento **aparece assinado no app**.
- Quando as duas partes assinam, o contrato fica **Assinado** (com trilha de auditoria: data/hora, IP, hash).

## Regras de negócio
1. **Proposta é dado vivo:** chega, pode ser **revisada** (nova versão), e tudo fica registrado. Nunca se perde versão anterior.
2. **Categoria é campo livre:** não há cadastro fechado de categorias. O que se digita vira **sugestão** de autocompletar (ordenada por uso). Mesma lógica para fornecedor, obra e local.
3. **A IA lê a proposta:** no cadastro, os dados (fornecedor, valor, prazo, pagamento, garantia, itens) são **extraídos do arquivo** pela IA; o usuário só informa obra + categoria e confere o resultado.
4. **Equalização nivela escopos:** o objetivo é comparar no mesmo nível (ex.: somar transporte a quem não incluiu). A recomendação da IA é **apoio**, não decisão automática.
5. **Vencedora pode ser direta:** com uma única proposta (ou por decisão), o usuário marca a vencedora **sem equalizar**; isso adjudica o certame e libera o contrato.
6. **Contrato é derivado da proposta:** editar o contrato não altera a proposta; a proposta vencedora é anexo e fonte das cláusulas.
7. **Assinatura eletrônica simples:** assinatura manuscrita (a dedo) + trilha de auditoria (quem, quando, IP, hash do documento). ICP-Brasil/certificado digital **fora de escopo** nesta fase.
8. **Nada se apaga de fato:** exclusão lógica (`deleted_at`) e tabela de **eventos** para propostas, versões, contratos e assinaturas.
9. **Ações destrutivas têm "Desfazer"** (toast de 5 s): excluir, arquivar edição, trocar vencedora.
10. **Offline/otimista (desejável):** ações de campo dão feedback imediato; upload de arquivos em segundo plano. (Pode entrar em milestone posterior.)

## Fora de escopo (nesta fase)
- Certificado digital ICP-Brasil / assinatura qualificada.
- Gestão financeira, pagamentos, medições ou ordens de compra.
- Integração com ERP.
- Portal público de fornecedores com login (o fornecedor interage só via link de assinatura).
- Maquete/representação 3D.

## Métricas de sucesso
- Tempo do recebimento da proposta até arquivada < 1 min (graças à extração por IA).
- Tempo para equalizar um certame com 4 propostas < 5 min.
- % de contratos gerados a partir da vencedora sem redigitação.
- % de contratos assinados digitalmente (vs. papel).

## Referência
O **protótipo navegável aprovado** (`prototipo-bid.html`) é a referência visual e de fluxo. Em caso de divergência entre protótipo e PRD, vale o PRD; se for ambíguo, perguntar ao usuário.
