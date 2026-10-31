# Contratos na minuta padrão — pacote de implementação (M9–M14)

Pacote para o Claude Code implementar no bid a geração de contratos de empreitada na **minuta padrão** (AMPLA/Clássica), com papéis por obra, revisão obrigatória por IA, validação, download .docx/PDF e assinatura das três partes.

## Ordem de leitura
1. `PRD-contratos.md` — o quê e por quê (papéis, fluxo, regras RC-xx, estados, questões abertas).
2. `CLAUDE-contratos.md` — regras novas e a regra 13 revisada (valem desde já para este trabalho).
3. `SPEC-contratos.md` — como (dados, RLS, RPCs, core, servidor, IA, assinatura, testes).
4. `PLAN-contratos.md` — milestones M9 → M14 com checklists e aceite.
5. `_privado/MODELO-MINUTA.md` — dicionário de marcadores, quadro, parâmetros, blocos e variantes.
6. `ref/motor-docx.mjs` — motor de referência (portar para `packages/server/src/contrato-docx.ts`).
7. `_privado/prototipo-contrato.html` — protótipo navegável (abrir no navegador; tem dados de um caso real, por isso fica fora do git).

## Conteúdo
```
docs/contratos/
  README.md · PRD-contratos.md · SPEC-contratos.md · PLAN-contratos.md · CLAUDE-contratos.md
  ref/      motor-docx.mjs · testar-motor.mjs · tokenizar_minuta.py
  casos/    caso-ficticio-01.json            (dados 100% fictícios)
  _privado/ (gitignored) prototipo-contrato.html · modelo-empreitada-v1.docx · clausulas-v1.json · biblioteca-v1.json · MODELO-MINUTA.md
```

## Antes de começar
- `_privado/` tem um `.gitignore` próprio que ignora tudo dentro dela — **confira com `git status`** que nada de lá aparece antes do primeiro commit.
- Testar o motor de referência (precisa de `jszip` só para o teste):
  `cd docs/contratos/ref && npm i --no-save jszip && node testar-motor.mjs ../_privado/modelo-empreitada-v1.docx ../_privado/clausulas-v1.json ../casos/caso-ficticio-01.json /tmp/saida.docx final`
  Resultado esperado: `faltando: []`.
- Logo AMPLA: não está no pacote — pedir ao usuário (PNG, mesmo tamanho da logo da Clássica no cabeçalho).

## Questões abertas (perguntar ao usuário quando chegar no milestone)
- **Q1** Gestor pode apagar a obra? (padrão: não)
- **Q2** Autoaprovação permitida com aviso? (padrão: sim, com aviso)
- **Q3** Tirar a equalização do PDF do contrato? (recomendado: sim — sigilo)
- **Q4** Testemunhas opcionais? (padrão: desligadas)

## Prompt inicial sugerido para o Claude Code
```
Leia CLAUDE.md e depois docs/contratos/README.md e todos os documentos na ordem indicada.
Vamos implementar os milestones M9 a M14 de docs/contratos/PLAN-contratos.md, um de cada vez.
Comece pelo M9. Antes de codificar, liste os itens do M9 que vai fazer, as migrations que vai criar
e os testes pgTAP/Vitest correspondentes. Siga as regras do CLAUDE.md e do CLAUDE-contratos.md
(principalmente: regra de domínio no core com teste; RLS + pgTAP no mesmo PR; nada da minuta no git;
dados fictícios). Um item por commit. Ao final do milestone, marque o checklist, registre desvios
em "Decisões" do docs/PLAN.md e rode uma revisão independente antes de seguir para o M10.
```
