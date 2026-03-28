export type LayoutInput = {
  warehouseWidthMm: number;
  warehouseLengthMm: number;
  corridorMm: number;
  moduleDepthMm: number;
  moduleWidthMm: number;
};

export type LayoutResult = {
  rows: number;
  modulesPerRow: number;
  modulesTotal: number;
  estimatedPositions: number;
};

export function calculateLayout(input: LayoutInput): LayoutResult {
  const { warehouseWidthMm, warehouseLengthMm, corridorMm, moduleDepthMm, moduleWidthMm } = input;

  const rows = Math.floor(warehouseWidthMm / (moduleDepthMm + corridorMm));
  const modulesPerRow = Math.floor(warehouseLengthMm / moduleWidthMm);
  const modulesTotal = rows * modulesPerRow;

  return {
    rows,
    modulesPerRow,
    modulesTotal,
    estimatedPositions: 0,
  };
}
