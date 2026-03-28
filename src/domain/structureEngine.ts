export type StructureInput = {
  capacityKgPerLevel: number;
  uprightHeightMm: number;
  levels: number;
};

export type UprightType = '8T' | '15T';

export type StructureResult = {
  uprightType: UprightType;
};

export function selectStructure(input: StructureInput): StructureResult {
  const { capacityKgPerLevel, uprightHeightMm } = input;

  if (capacityKgPerLevel <= 2000 && uprightHeightMm <= 6000) {
    return { uprightType: '8T' };
  }

  return { uprightType: '15T' };
}
