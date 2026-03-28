import type { LayoutResult } from './layoutEngine';

/** Largura visual de cada módulo (eixo do comprimento do galpão). */
const CELL_W = 56;
/** Profundidade visual de cada módulo (eixo da largura do galpão). */
const CELL_H = 36;
/** Faixa visual entre filas de módulos (rua / corredor). */
const CORRIDOR_BAND = 12;
const PAD = 10;
const MODULE_FILL = '#6b9bd1';
const MODULE_STROKE = '#2c5282';
const CORRIDOR_FILL = '#d8d8d8';
const CORRIDOR_STROKE = '#9ca3af';
const WAREHOUSE_FILL = '#fafafa';
const WAREHOUSE_STROKE = '#1f2937';

/**
 * Gera um SVG esquemático: contorno do galpão, corredores entre filas e blocos dos módulos.
 * Proporções são convencionais (não escalonadas em mm); `layout` define apenas a contagem.
 */
export function generateFloorPlanSvg(layout: LayoutResult): string {
  const rows = Math.max(0, layout.rows);
  const cols = Math.max(0, layout.modulesPerRow);

  const gridW = Math.max(cols * CELL_W, 48);
  const gridH =
    rows > 0 ? rows * CELL_H + Math.max(0, rows - 1) * CORRIDOR_BAND : Math.max(CELL_H, 48);

  const vbW = gridW + 2 * PAD;
  const vbH = gridH + 2 * PAD;
  const x0 = PAD;
  const y0 = PAD;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbW} ${vbH}" width="${vbW}" height="${vbH}">`,
  );
  parts.push('<title>Planta esquemática do galpão</title>');
  parts.push(`<rect x="0" y="0" width="${vbW}" height="${vbH}" fill="#eef0f2"/>`);

  parts.push(
    `<rect x="${x0}" y="${y0}" width="${gridW}" height="${gridH}" fill="${WAREHOUSE_FILL}" stroke="${WAREHOUSE_STROKE}" stroke-width="2"/>`,
  );

  for (let r = 0; r < rows; r++) {
    const rowY = y0 + r * (CELL_H + CORRIDOR_BAND);

    if (r < rows - 1) {
      const cy = rowY + CELL_H;
      parts.push(
        `<line x1="${x0}" y1="${cy + CORRIDOR_BAND / 2}" x2="${x0 + gridW}" y2="${cy + CORRIDOR_BAND / 2}" stroke="${CORRIDOR_STROKE}" stroke-width="1.5" stroke-dasharray="5 4"/>`,
      );
      parts.push(
        `<rect x="${x0}" y="${cy}" width="${gridW}" height="${CORRIDOR_BAND}" fill="${CORRIDOR_FILL}" fill-opacity="0.55" stroke="none"/>`,
      );
    }

    for (let c = 0; c < cols; c++) {
      const mx = x0 + c * CELL_W + 1;
      const my = rowY + 1;
      const mw = CELL_W - 2;
      const mh = CELL_H - 2;
      parts.push(
        `<rect x="${mx}" y="${my}" width="${mw}" height="${mh}" rx="2" fill="${MODULE_FILL}" stroke="${MODULE_STROKE}" stroke-width="1"/>`,
      );
    }
  }

  parts.push('</svg>');
  return parts.join('');
}
