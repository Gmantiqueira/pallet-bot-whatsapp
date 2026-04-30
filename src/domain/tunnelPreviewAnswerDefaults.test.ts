import { mergeAnswersForTunnelPreview } from './tunnelPreviewAnswerDefaults';

describe('mergeAnswersForTunnelPreview', () => {
  it('mantém valores existentes e não marca placeholders', () => {
    const { answers, usedPlaceholderSpecs } = mergeAnswersForTunnelPreview({
      capacityKg: 1500,
      levels: 5,
      heightMm: 4800,
      heightMode: 'DIRECT',
    });
    expect(usedPlaceholderSpecs).toBe(false);
    expect(answers.capacityKg).toBe(1500);
    expect(answers.levels).toBe(5);
    expect(answers.heightMm).toBe(4800);
    expect(answers.heightMode).toBe('DIRECT');
  });

  it('preenche ausentes e marca placeholders', () => {
    const { answers, usedPlaceholderSpecs } = mergeAnswersForTunnelPreview({});
    expect(usedPlaceholderSpecs).toBe(true);
    expect(typeof answers.capacityKg).toBe('number');
    expect(typeof answers.levels).toBe('number');
    expect(typeof answers.heightMm).toBe('number');
    expect(answers.heightMode).toBe('DIRECT');
  });

  it('marca placeholder quando só falta capacidade', () => {
    const { usedPlaceholderSpecs } = mergeAnswersForTunnelPreview({
      levels: 3,
      heightMm: 4500,
      heightMode: 'DIRECT',
    });
    expect(usedPlaceholderSpecs).toBe(true);
  });
});
