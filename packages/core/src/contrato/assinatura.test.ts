import { describe, expect, it } from 'vitest';
import { indiceDoSignatario, mensagemAssinatura, signatariosPendentes, todasObrigatoriasAssinaram, type SignatarioResumo } from './assinatura';

const sigs: SignatarioResumo[] = [
  { id: 'ct', parte: 'contratante', nome: 'Sicrano', obrigatorio: true },
  { id: 'cd', parte: 'contratada', nome: 'Beltrano', obrigatorio: true },
  { id: 'cs1', parte: 'construtora', nome: 'Diretor Um', obrigatorio: true },
  { id: 'cs2', parte: 'construtora', nome: 'Diretor Dois', obrigatorio: true },
  { id: 't1', parte: 'testemunha', nome: 'Teste', obrigatorio: false },
];
const ass = (ids: string[]) => ids.map((id) => ({ signatarioId: id, assinadoEm: '2026-11-05T10:00:00Z' }));

describe('assinatura v2', () => {
  it('só com todos os obrigatórios; testemunha não conta; sem signatários = falso', () => {
    expect(todasObrigatoriasAssinaram(sigs, ass(['ct', 'cd', 'cs1']))).toBe(false);
    expect(todasObrigatoriasAssinaram(sigs, ass(['ct', 'cd', 'cs1', 'cs2']))).toBe(true);
    expect(todasObrigatoriasAssinaram(sigs, ass(['ct', 'cd', 'cs1', 'cs2', 't1']))).toBe(true);
    expect(todasObrigatoriasAssinaram([], [])).toBe(false);
    expect(todasObrigatoriasAssinaram(sigs, [{ signatarioId: 'ct', assinadoEm: null }])).toBe(false);
  });
  it('pendentes e índice estável', () => {
    expect(signatariosPendentes(sigs, ass(['ct', 'cs2'])).map((s) => s.id)).toEqual(['cd', 'cs1', 't1']);
    expect(indiceDoSignatario(sigs, 'ct')).toBe(0);
    expect(indiceDoSignatario(sigs, 'cs2')).toBe(2); // "Diretor Dois" < "Diretor Um"
    expect(indiceDoSignatario(sigs, 'x')).toBe(0);
  });
  it('mensagem do WhatsApp', () => {
    const m = mensagemAssinatura({ nome: 'Beltrano', parte: 'contratada', numero: 'CT-2026-001', obra: 'Residencial X', url: 'https://bid.app/sign/abc' });
    expect(m).toContain('CT-2026-001');
    expect(m).toContain('como contratada');
    expect(m).toContain('https://bid.app/sign/abc');
  });
});
