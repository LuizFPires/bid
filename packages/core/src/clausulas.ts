/**
 * Minuta do contrato — geração PURA das cláusulas a partir da proposta vencedora
 * (regra #1: "textos de cláusula" vivem no core, testados). As cláusulas de
 * objeto/preço/prazo/garantia vêm da proposta; as demais são padrão (modelo),
 * editáveis depois pelo usuário. Editar o contrato não altera a proposta
 * (regra #8) — estas funções só montam o texto inicial.
 */

import { formatBRL } from './money';

export type OrigemClausula = 'proposta' | 'modelo';

export interface Clausula {
  numero: number;
  titulo: string;
  texto: string;
  origem: OrigemClausula;
}

export interface DadosContrato {
  /** Objeto do contrato (categoria/título do certame). */
  objeto: string;
  /** Fornecedor vencedor (a CONTRATADA). */
  contratada: string;
  obra: string;
  valor: number | null;
  prazoDias: number | null;
  condicaoPagamento: string | null;
  garantia: string | null;
}

function valorTexto(v: number | null): string {
  return v !== null ? formatBRL(v) : 'a definir';
}

/** Gera a minuta inicial: cláusulas da proposta + cláusulas padrão (modelo). */
export function gerarClausulas(d: DadosContrato): Clausula[] {
  const objeto = d.objeto.trim() || 'os serviços contratados';
  const contratada = d.contratada.trim() || 'a CONTRATADA';
  const obra = d.obra.trim() || 'a obra';

  const daProposta: Omit<Clausula, 'numero'>[] = [
    {
      titulo: 'Do objeto',
      origem: 'proposta',
      texto: `O presente contrato tem por objeto a execução de ${objeto}, referente a ${obra}, por ${contratada}, conforme a proposta vencedora anexa (Anexo I).`,
    },
    {
      titulo: 'Do preço e da forma de pagamento',
      origem: 'proposta',
      texto:
        `Pela execução do objeto, a CONTRATANTE pagará o valor total de ${valorTexto(d.valor)}.` +
        (d.condicaoPagamento ? ` Forma de pagamento: ${d.condicaoPagamento.trim()}.` : ''),
    },
    {
      titulo: 'Do prazo de execução',
      origem: 'proposta',
      texto:
        d.prazoDias !== null
          ? `O prazo de execução é de ${d.prazoDias} dias corridos, contados da ordem de início.`
          : `O prazo de execução será definido na ordem de início.`,
    },
  ];

  if (d.garantia) {
    daProposta.push({
      titulo: 'Da garantia',
      origem: 'proposta',
      texto: `A CONTRATADA oferece garantia de ${d.garantia.trim()} sobre os serviços executados, contados do recebimento definitivo.`,
    });
  }

  const padrao: Omit<Clausula, 'numero'>[] = [
    {
      titulo: 'Das obrigações da CONTRATADA',
      origem: 'modelo',
      texto:
        'A CONTRATADA obriga-se a executar o objeto com esmero e técnica, fornecendo mão de obra, materiais e equipamentos necessários, e a cumprir as normas de segurança do trabalho aplicáveis.',
    },
    {
      titulo: 'Das obrigações da CONTRATANTE',
      origem: 'modelo',
      texto:
        'A CONTRATANTE obriga-se a disponibilizar o acesso ao local da obra e a efetuar os pagamentos nas condições pactuadas.',
    },
    {
      titulo: 'Da rescisão',
      origem: 'modelo',
      texto:
        'O contrato poderá ser rescindido por descumprimento de qualquer cláusula, mediante notificação por escrito, sem prejuízo das penalidades cabíveis.',
    },
    {
      titulo: 'Do foro',
      origem: 'modelo',
      texto:
        'As partes elegem o foro da comarca da obra para dirimir dúvidas oriundas deste contrato, com renúncia a qualquer outro.',
    },
  ];

  return [...daProposta, ...padrao].map((c, i) => ({ numero: i + 1, ...c }));
}
