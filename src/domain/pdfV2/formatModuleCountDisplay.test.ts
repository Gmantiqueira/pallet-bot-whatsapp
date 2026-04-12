import { formatModuleCountForDocumentPt } from './formatModuleCountDisplay';

describe('formatModuleCountForDocumentPt', () => {
  it('inteiro: singular e plural', () => {
    expect(formatModuleCountForDocumentPt(0)).toBe('0 módulos');
    expect(formatModuleCountForDocumentPt(1)).toBe('1 módulo');
    expect(formatModuleCountForDocumentPt(10)).toBe('10 módulos');
  });

  it('meio módulo sozinho', () => {
    expect(formatModuleCountForDocumentPt(0.5)).toBe('1 meio módulo');
  });

  it('inteiros + meio (opção A)', () => {
    expect(formatModuleCountForDocumentPt(10.5)).toBe(
      '10 módulos + 1 meio módulo'
    );
    expect(formatModuleCountForDocumentPt(1.5)).toBe(
      '1 módulo + 1 meio módulo'
    );
  });

  it('ajusta ruído de vírgula flutuante para múltiplos de 0,5', () => {
    expect(formatModuleCountForDocumentPt(10.499999999)).toBe(
      '10 módulos + 1 meio módulo'
    );
  });

  it('valores inválidos', () => {
    expect(formatModuleCountForDocumentPt(Number.NaN)).toBe('—');
    expect(formatModuleCountForDocumentPt(-1)).toBe('—');
  });
});
