import { describe, expect, it } from 'vitest';
import { gerencia, podeAcao, type AcaoObra, type PapelObra } from './fluxo';

const papeis: PapelObra[] = ['dono', 'gestor', 'colaborador'];

describe('podeAcao — matriz do PRD-contratos §3', () => {
  it('todos os papéis veem, sobem proposta, equalizam, montam e enviam para validação', () => {
    const comuns: AcaoObra[] = ['ver', 'subir_proposta', 'equalizar', 'definir_vencedora', 'montar_contrato', 'enviar_validacao'];
    for (const p of papeis) for (const a of comuns) expect(podeAcao(p, a)).toBe(true);
  });

  it('colaborador não aprova, não emite, não apaga, não convida, não muda papel', () => {
    const gerenciais: AcaoObra[] = ['aprovar_contrato', 'devolver_contrato', 'emitir_contrato', 'aprovar_variante', 'apagar_proposta', 'apagar_equalizacao', 'apagar_contrato', 'cancelar_contrato', 'convidar', 'mudar_papel', 'remover_acesso', 'editar_cadastros'];
    for (const a of gerenciais) {
      expect(podeAcao('colaborador', a)).toBe(false);
      expect(podeAcao('gestor', a)).toBe(true);
      expect(podeAcao('dono', a)).toBe(true);
    }
  });

  it('só o dono apaga a obra (Q1 padrão)', () => {
    expect(podeAcao('dono', 'apagar_obra')).toBe(true);
    expect(podeAcao('gestor', 'apagar_obra')).toBe(false);
    expect(podeAcao('colaborador', 'apagar_obra')).toBe(false);
  });

  it('sem papel, nada', () => {
    expect(podeAcao(null, 'ver')).toBe(false);
    expect(podeAcao(undefined, 'subir_proposta')).toBe(false);
  });

  it('ações de contrato respeitam o estado (PRD-contratos §6)', () => {
    expect(podeAcao('gestor', 'aprovar_contrato', 'em_validacao')).toBe(true);
    expect(podeAcao('gestor', 'aprovar_contrato', 'rascunho')).toBe(false);
    expect(podeAcao('gestor', 'emitir_contrato', 'aprovado')).toBe(true);
    expect(podeAcao('gestor', 'emitir_contrato', 'em_validacao')).toBe(false);
    expect(podeAcao('colaborador', 'enviar_validacao', 'devolvido')).toBe(true);
    expect(podeAcao('colaborador', 'enviar_validacao', 'em_validacao')).toBe(false);
    expect(podeAcao('dono', 'apagar_contrato', 'emitido')).toBe(false);
    expect(podeAcao('dono', 'cancelar_contrato', 'emitido')).toBe(true);
    expect(podeAcao('dono', 'cancelar_contrato', 'assinado')).toBe(false);
  });
});

describe('gerencia', () => {
  it('dono e gestor gerenciam; colaborador e sem papel não', () => {
    expect(gerencia('dono')).toBe(true);
    expect(gerencia('gestor')).toBe(true);
    expect(gerencia('colaborador')).toBe(false);
    expect(gerencia(null)).toBe(false);
  });
});
