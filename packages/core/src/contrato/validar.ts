import { precisaRatificacao } from './blocos';
import { camposFaltando } from './parametros';
import { divergenciaValor, totalPlanilha, type LinhaPlanilha } from './planilha';
import { cnpjValido, cpfValido } from './qualificacao';
import { justificativaValida } from './revisao';
import type { Dossie, ItemClausula, ParametrosContrato, PartesContrato, SignatarioContrato } from './tipos';

export type EtapaContrato = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface Pendencia {
  codigo: string;
  etapa: EtapaContrato;
  texto: string;
  /** true = impede o envio para validação; false = só avisa (a revisão IA trata). */
  bloqueia: boolean;
}

export interface EntradaValidar {
  dossie: Dossie | null;
  parametros: ParametrosContrato;
  partes: Partial<PartesContrato>;
  itens: readonly ItemClausula[];
  planilha: readonly LinhaPlanilha[];
  blocos: readonly { chave: string }[];
  signatarios: readonly SignatarioContrato[];
  /** Marcadores vazios apontados pelo servidor na última resolução (`parametros._faltando`). */
  faltandoServidor?: readonly string[];
}

/** Checklist do envio (SPEC §4 validar.ts): cada regra isolada, com a etapa onde se corrige. */
export function pendencias(e: EntradaValidar): Pendencia[] {
  const out: Pendencia[] = [];
  const add = (codigo: string, etapa: EtapaContrato, texto: string, bloqueia = true) => out.push({ codigo, etapa, texto, bloqueia });

  if (!e.dossie) add('dossie', 1, 'O dossiê da vencedora não foi montado.');

  for (const [chave, rotulo] of [['contratante', 'Contratante'], ['contratada', 'Contratada'], ['construtora', 'Construtora']] as const) {
    const parte = e.partes[chave];
    if (!parte) add(`parte:${chave}`, 2, `${rotulo} não definida.`);
    else {
      if (!cnpjValido(parte.cnpj)) add(`cnpj:${chave}`, 2, `CNPJ da ${rotulo.toLowerCase()} inválido.`);
      if (!parte.qualificacao?.trim()) add(`qualificacao:${chave}`, 2, `${rotulo} sem qualificação.`);
      if (!e.signatarios.some((s) => s.parte === chave && s.nome.trim())) add(`signatario:${chave}`, 2, `${rotulo} sem signatário.`);
    }
  }
  for (const s of e.signatarios) if (s.cpf && !cpfValido(s.cpf)) add(`cpf:${s.nome}`, 2, `CPF de ${s.nome} inválido.`);

  const faltam = camposFaltando(e.parametros);
  if (faltam.length) add('quadro', 3, `${faltam.length} ${faltam.length === 1 ? 'campo obrigatório vazio' : 'campos obrigatórios vazios'} no quadro: ${faltam.slice(0, 4).map((c) => c.rotulo).join(', ')}${faltam.length > 4 ? '…' : ''}.`);
  if (e.parametros.decl_cpf && !cpfValido(e.parametros.decl_cpf)) add('decl_cpf', 3, 'CPF do declarante (Anexo II) inválido.');

  const linhas = e.planilha.filter((l) => !l.grupo);
  if (!linhas.length) add('planilha', 4, 'A planilha de preços está vazia (o valor do contrato é a soma dela).');
  else {
    if (linhas.some((l) => l.quantidade == null || l.preco_unitario == null)) add('planilha:incompleta', 4, 'Há item da planilha sem quantidade ou preço unitário.');
    const dif = divergenciaValor(totalPlanilha(e.planilha), e.dossie?.proposta.valor ?? null);
    if (dif.difere) add('planilha:valor', 4, 'A soma da planilha difere do valor da proposta (a revisão IA aponta o conflito).', false);
  }

  const ratif = precisaRatificacao(e.partes, { incluir: e.parametros.anexo_iii_incluir === 'sim', emitente: e.parametros.prop_emitente ?? null, destinatario: e.parametros.prop_destinatario ?? null });
  if (ratif && !e.blocos.some((b) => b.chave === 'ratificacao_proposta')) add('ratificacao', 5, 'Proposta anexada dirigida a outra empresa: o bloco de ratificação é obrigatório (RC-14).');

  for (const it of e.itens) {
    if (it.origem === 'variante' && !justificativaValida(it.justificativa ?? '')) add(`justificativa:${it.numero}`, 6, `Item ${it.numero} alterado sem justificativa.`);
  }
  const reduzem = e.itens.filter((i) => i.reduzProtecao && !i.suprimido);
  if (reduzem.length) add('reduz_protecao', 6, `${reduzem.length} ${reduzem.length === 1 ? 'variante reduz' : 'variantes reduzem'} a proteção da contratante: dono/gestor aprova item a item.`, false);

  for (const k of e.faltandoServidor ?? []) if (!/^ass_/.test(k)) add(`marcador:${k}`, 3, `Marcador "${k}" vazio no documento.`);

  return out;
}

export function pendenciasBloqueantes(lista: readonly Pendencia[]): Pendencia[] {
  return lista.filter((p) => p.bloqueia);
}

/** Pendências por etapa, para o seletor de etapas (✓ / ⚠). */
export function pendenciasPorEtapa(lista: readonly Pendencia[]): Record<EtapaContrato, Pendencia[]> {
  const out = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] } as Record<EtapaContrato, Pendencia[]>;
  for (const p of lista) out[p.etapa].push(p);
  return out;
}
