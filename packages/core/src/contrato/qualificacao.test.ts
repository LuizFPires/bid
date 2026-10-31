import { describe, expect, it } from 'vitest';
import { cnoValido, cnpjValido, cpfValido, formatarCnpj, formatarCno, listarNomes, mascararCpf, nomeNoTexto, qualificar } from './qualificacao';

describe('documentos', () => {
  it('CNPJ por dígito verificador (casos fictícios do pacote)', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('22.333.444/0001-81')).toBe(true);
    expect(cnpjValido('33.444.555/0001-81')).toBe(true);
    expect(cnpjValido('11.222.333/0001-82')).toBe(false);
    expect(cnpjValido('00000000000000')).toBe(false);
    expect(cnpjValido('123')).toBe(false);
  });
  it('CPF por dígito verificador', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('529.982.247-26')).toBe(false);
    expect(cpfValido('111.111.111-11')).toBe(false);
  });
  it('CNO: 12 dígitos (só formato)', () => {
    expect(cnoValido('90.000.00000/01')).toBe(true);
    expect(cnoValido('9000000000')).toBe(false);
  });
  it('formatação e máscara', () => {
    expect(formatarCnpj('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatarCno('900000000001')).toBe('90.000.00000/01');
    expect(mascararCpf('52998224725')).toBe('***.982.247-**');
  });
});

describe('qualificar', () => {
  const cd = { razao_social: 'Fundações Exemplo Ltda.', natureza: 'sociedade empresária limitada', cnpj: '11222333000181', endereco: 'Av. Teste, 50, Cidade Exemplo/MG', cep: '30000002' };
  it('1 signatário, com CEP', () => {
    expect(qualificar(cd, [{ nome: 'Beltrano Exemplo', cargo: 'Sócio-administrador' }])).toBe(
      'Fundações Exemplo Ltda., sociedade empresária limitada, inscrita no CNPJ sob nº 11.222.333/0001-81, com sede na Av. Teste, 50, Cidade Exemplo/MG, CEP 30000-002, neste ato representada por Beltrano Exemplo',
    );
  });
  it('2 diretores → "seus diretores A e B"; sem CEP', () => {
    const cs = { razao_social: 'Construtora Exemplo S.A.', natureza: 'sociedade anônima', cnpj: '33444555000181', endereco: 'Rua Beta, 2, Cidade Exemplo/MG' };
    expect(qualificar(cs, [{ nome: 'Diretor Um', cargo: 'Diretor' }, { nome: 'Diretor Dois', cargo: 'Diretor' }])).toBe(
      'Construtora Exemplo S.A., sociedade anônima, inscrita no CNPJ sob nº 33.444.555/0001-81, com sede na Rua Beta, 2, Cidade Exemplo/MG, neste ato representada por seus diretores Diretor Um e Diretor Dois',
    );
  });
  it('3 signatários com cargos distintos e nenhum signatário', () => {
    expect(qualificar(cd, [{ nome: 'A' }, { nome: 'B', cargo: 'Diretor' }, { nome: 'C' }])).toContain('representada por A, B e C');
    expect(qualificar(cd, [])).not.toContain('representada');
  });
  it('listarNomes e nome no texto', () => {
    expect(listarNomes(['A'])).toBe('A');
    expect(listarNomes(['A', 'B'])).toBe('A e B');
    expect(listarNomes(['A', 'B', 'C'])).toBe('A, B e C');
    expect(nomeNoTexto({ razao_social: 'SPE Exemplo Empreendimentos Ltda.', nome_curto: 'SPE EXEMPLO' })).toBe('SPE EXEMPLO');
    expect(nomeNoTexto({ razao_social: 'SPE Exemplo Empreendimentos Ltda.', nome_curto: null })).toBe('SPE Exemplo Empreendimentos Ltda.');
  });
});
