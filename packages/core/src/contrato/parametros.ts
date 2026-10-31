import { formatBRL } from '../money';
import { somaItens } from '../extracao';
import type { Dossie, ParametrosContrato, PartesContrato } from './tipos';
import { formatarCep, nomeNoTexto } from './qualificacao';

/**
 * Campos do quadro-resumo e demais marcadores simples da minuta
 * (docs/contratos/_privado/MODELO-MINUTA.md §2). `fonte` diz de onde vem a
 * sugestão inicial; `auto` são calculados pelo servidor/core e não se editam.
 */
export type OrigemCampo = 'obra' | 'dossie' | 'cadastro' | 'usuario' | 'sugestao' | 'auto';

export interface CampoQuadro {
  chave: string;
  numero: string | null;
  rotulo: string;
  obrigatorio: boolean;
  fonte: OrigemCampo;
  ajuda: string;
  multilinha?: boolean;
}

export const QUADRO: readonly CampoQuadro[] = [
  { chave: 'obra_nome', numero: '01', rotulo: 'Obra', obrigatorio: true, fonte: 'obra', ajuda: 'Nome do empreendimento como consta no cadastro da obra.' },
  { chave: 'obra_endereco', numero: '02', rotulo: 'Localização', obrigatorio: true, fonte: 'obra', ajuda: 'Endereço completo da obra, com CEP.' },
  { chave: 'obra_cno', numero: '03', rotulo: 'CNO', obrigatorio: true, fonte: 'obra', ajuda: 'Cadastro Nacional de Obras (12 dígitos).' },
  { chave: 'empreitada_desc', numero: null, rotulo: 'Objeto (frase curta)', obrigatorio: true, fonte: 'dossie', ajuda: 'Abertura do contrato: "execução de …". Vem da categoria e da proposta.' },
  { chave: 'escopo_resumo', numero: '04', rotulo: 'Objeto / escopo', obrigatorio: true, fonte: 'dossie', ajuda: 'Resumo do escopo contratado; a planilha do Anexo I detalha.', multilinha: true },
  { chave: 'q_regime', numero: '05', rotulo: 'Regime de preço', obrigatorio: true, fonte: 'dossie', ajuda: 'Preço unitário (medição por quantidades) ou preço global.' },
  { chave: 'q_valor', numero: '06', rotulo: 'Valor total', obrigatorio: true, fonte: 'auto', ajuda: 'Soma da planilha (Anexo I), calculada pelo servidor.' },
  { chave: 'q_inicio', numero: '07', rotulo: 'Início e mobilização', obrigatorio: true, fonte: 'usuario', ajuda: 'Data de início (ou "na assinatura") e prazo de mobilização.' },
  { chave: 'q_prazo', numero: '08', rotulo: 'Prazo de execução', obrigatorio: true, fonte: 'dossie', ajuda: 'Prazo em dias corridos, conforme a proposta.' },
  { chave: 'q_marcos', numero: '08', rotulo: 'Marcos intermediários', obrigatorio: true, fonte: 'sugestao', ajuda: '"Não se aplica" quando não houver cronograma por marcos.' },
  { chave: 'q_docs', numero: '09', rotulo: 'Documentos técnicos vinculantes', obrigatorio: true, fonte: 'usuario', ajuda: 'Projetos e revisões, sondagens, memoriais que regem a execução.', multilinha: true },
  { chave: 'q_criterio', numero: '10', rotulo: 'Critério de medição', obrigatorio: true, fonte: 'sugestao', ajuda: 'Como se mede o executado (por quantidade, por etapa…).' },
  { chave: 'q_periodicidade', numero: '11', rotulo: 'Medições', obrigatorio: true, fonte: 'sugestao', ajuda: 'Periodicidade e dia de corte. O prazo de pagamento (21 dias) é fixo na minuta.' },
  { chave: 'q_liberacao', numero: '11', rotulo: 'Liberação da medição', obrigatorio: true, fonte: 'sugestao', ajuda: 'Prazo para aprovar a medição.' },
  { chave: 'q_antecipacao', numero: '12', rotulo: 'Antecipações', obrigatorio: true, fonte: 'dossie', ajuda: 'Sinal/entrada previstos na proposta; "Não há" se não houver.' },
  { chave: 'q_retencao', numero: '13', rotulo: 'Retenção de garantia', obrigatorio: true, fonte: 'sugestao', ajuda: 'Percentual retido em cada medição.' },
  { chave: 'q_garantia', numero: '14', rotulo: 'Garantia técnica adicional', obrigatorio: true, fonte: 'dossie', ajuda: 'Garantia oferecida na proposta, além da legal.' },
  { chave: 'q_seguros', numero: '15', rotulo: 'Seguros e garantias financeiras', obrigatorio: true, fonte: 'usuario', ajuda: 'Seguros exigidos (RC, riscos de engenharia) e garantias.' },
  { chave: 'q_mat_contratante', numero: '16', rotulo: 'Materiais da contratante', obrigatorio: true, fonte: 'sugestao', ajuda: 'O que a contratante fornece; "Não há" se nada.' },
  { chave: 'q_mat_contratada', numero: '17', rotulo: 'Materiais e equipamentos da contratada', obrigatorio: true, fonte: 'dossie', ajuda: 'O que a contratada fornece (da proposta).' },
  { chave: 'q_fat_direto', numero: '18', rotulo: 'Faturamento direto', obrigatorio: true, fonte: 'sugestao', ajuda: '"Não há", ou resumo do bloco de faturamento direto com insumo de referência.' },
  { chave: 'q_representante', numero: '19', rotulo: 'Representante da contratada', obrigatorio: true, fonte: 'cadastro', ajuda: 'Responsável técnico da contratada na obra.' },
  { chave: 'ct_email', numero: '20', rotulo: 'E-mail da contratante', obrigatorio: true, fonte: 'cadastro', ajuda: 'Contato oficial para notificações.' },
  { chave: 'cd_email', numero: '20', rotulo: 'E-mail da contratada', obrigatorio: true, fonte: 'cadastro', ajuda: 'Contato oficial para notificações.' },
  { chave: 'cs_email', numero: '20', rotulo: 'E-mail da construtora', obrigatorio: true, fonte: 'cadastro', ajuda: 'Contato oficial para notificações.' },
  { chave: 'obra_foro', numero: null, rotulo: 'Foro', obrigatorio: true, fonte: 'obra', ajuda: 'Comarca para dirimir dúvidas (cláusula 22.8). Padrão: cidade da obra.' },
  { chave: 'decl_nome', numero: null, rotulo: 'Declarante (Anexo II) — nome', obrigatorio: true, fonte: 'cadastro', ajuda: 'Quem assina a declaração de capacidade pela contratada.' },
  { chave: 'decl_cpf', numero: null, rotulo: 'Declarante — CPF', obrigatorio: true, fonte: 'cadastro', ajuda: 'CPF do declarante.' },
  { chave: 'decl_cargo', numero: null, rotulo: 'Declarante — cargo', obrigatorio: true, fonte: 'cadastro', ajuda: 'Cargo do declarante.' },
];

export const CAMPO_POR_CHAVE: ReadonlyMap<string, CampoQuadro> = new Map(QUADRO.map((c) => [c.chave, c]));

function temQuantidades(d: Dossie): boolean {
  return d.proposta.itens.some((i) => i.qtd != null && i.qtd > 0 && i.unit != null);
}

function primeiraFrase(s: string | null | undefined, max = 140): string | null {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const corte = t.search(/[.;\n]/);
  const frase = corte > 20 ? t.slice(0, corte) : t;
  return frase.length > max ? frase.slice(0, max - 1).trimEnd() + '…' : frase;
}

/**
 * Sugestões iniciais do quadro a partir do dossiê, da obra e dos cadastros.
 * Só preenche o que tem base; o resto fica vazio para o usuário (campo
 * obrigatório vazio vira pendência). `q_valor` é do servidor (soma da planilha).
 */
export function parametrosIniciais(d: Dossie, partes: PartesContrato, extras?: { representante?: string | null; declarante?: { nome: string; cpf: string | null; cargo: string | null } | null }): ParametrosContrato {
  const p: ParametrosContrato = {};
  const set = (k: string, v: string | null | undefined) => {
    if (v && v.trim()) p[k] = v.trim();
  };
  set('obra_nome', d.obra.nome);
  set('obra_endereco', d.obra.endereco ? `${d.obra.endereco}${d.obra.cep ? `, CEP ${formatarCep(d.obra.cep)}` : ''}` : null);
  set('obra_cno', d.obra.cno);
  set('obra_foro', d.obra.foro ?? d.obra.cidade);

  const cat = d.categoria.trim();
  const catMin = cat ? cat.charAt(0).toLowerCase() + cat.slice(1) : '';
  set('empreitada_desc', cat ? `execução de ${catMin}` : null);
  const esc = primeiraFrase(d.proposta.observacoes) ?? null;
  set('escopo_resumo', [cat ? `${cat}` : null, esc].filter(Boolean).join(': ') || null);

  const unitario = temQuantidades(d);
  set('q_regime', d.proposta.itens.length ? (unitario ? 'Preço unitário — pagamento pelas quantidades efetivamente medidas.' : 'Preço global.') : null);
  set('q_criterio', d.proposta.itens.length ? (unitario ? 'Medição mensal pelas quantidades executadas, conforme planilha do Anexo I.' : 'Medição mensal por etapa concluída, conforme cronograma.') : null);
  set('q_prazo', d.proposta.prazoDias != null ? `${d.proposta.prazoDias} dias corridos` : null);
  set('q_marcos', 'Não se aplica.');
  set('q_periodicidade', 'Mensal, com corte no dia 25.');
  set('q_liberacao', 'Até 10 dias após a aprovação da medição.');
  set('q_retencao', '5% de cada medição.');
  set('q_antecipacao', d.proposta.condicaoPagamento ? (/\b(sinal|entrada|antecip|adiant)/i.test(d.proposta.condicaoPagamento) ? d.proposta.condicaoPagamento : 'Não há.') : null);
  set('q_garantia', d.proposta.garantia);
  set('q_mat_contratante', 'Não há.');
  set('q_fat_direto', 'Não há.');
  const soma = somaItens(d.proposta.itens);
  if (d.proposta.itens.length) {
    const nomes = d.proposta.itens.slice(0, 4).map((i) => i.descricao).filter(Boolean);
    set('q_mat_contratada', nomes.length ? `Conforme planilha do Anexo I (${nomes.join(', ')}${d.proposta.itens.length > 4 ? '…' : ''}).` : null);
  }
  if (soma != null && d.proposta.valor != null && Math.abs(soma - d.proposta.valor) > 0.01) {
    // deixa sinal para a revisão (não é campo do quadro)
    p._aviso_soma = `A soma dos itens lidos (${formatBRL(soma)}) difere do valor da proposta (${formatBRL(d.proposta.valor)}).`;
  }

  set('ct_email', partes.contratante?.email);
  set('cd_email', partes.contratada?.email);
  set('cs_email', partes.construtora?.email);
  set('q_representante', extras?.representante);
  if (extras?.declarante) {
    set('decl_nome', extras.declarante.nome);
    set('decl_cpf', extras.declarante.cpf);
    set('decl_cargo', extras.declarante.cargo);
  }
  if (partes.contratante) set('ct_nome_curto', nomeNoTexto(partes.contratante));
  if (partes.contratada) set('cd_nome_curto', nomeNoTexto(partes.contratada));
  if (partes.construtora) set('cs_nome_curto', nomeNoTexto(partes.construtora));
  return p;
}

/** Campos obrigatórios do quadro ainda vazios (para o seletor de etapas e o envio). */
export function camposFaltando(p: ParametrosContrato): CampoQuadro[] {
  return QUADRO.filter((c) => c.obrigatorio && c.fonte !== 'auto' && !(p[c.chave] ?? '').trim());
}
