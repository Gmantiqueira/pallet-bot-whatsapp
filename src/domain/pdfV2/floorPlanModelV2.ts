import type { LayoutGeometry, RackModule, RackRow } from './layoutGeometryV2';
import type {
  FloorPlanCirculationSemantic,
  FloorPlanDimension,
  FloorPlanLabel,
  FloorPlanModelV2,
  RackDepthModeV2,
} from './types';
import { ELEV_BEAM_FILL } from './elevationVisualTokens';

/**
 * Canvas SVG da planta.
 *
 * **Mesma convenção que {@link buildLayoutGeometry}:** cada `structureRects` vem de
 * `RackModule.footprint` (retângulos em mm no referencial do galpão). O eixo **longitudinal da linha**
 * é o do vão (face frontal do módulo); o eixo **transversal da faixa** é a profundidade de posição.
 * Não há segunda geometria aqui — só escala e projeção para o viewBox SVG.
 *
 * - Para L ≈ W, se `innerH` < `innerW`, `scale = innerH/W` fica baixo e o bitmap fica “paisagem”; no PDF
 *   o encaixe limita pela largura e sobra ~metade da página em branco. Por isso `VB_H` é alto o suficiente
 *   para `innerH >= innerW` (escala passa a usar a largura útil) e a razão VB_W/VB_H ≈ 0,72 aproxima a
 *   zona útil A4 (largura/altura) para o `fitRasterInBox` encher altura e largura ao mesmo tempo.
 */
const VB_W = 1360;
const VB_H = 1900;
const PAD = 22;
const HEADER = 50;
const DIM_OUT = 24;

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMm(mm: number): string {
  return `${Math.round(mm).toLocaleString('pt-BR')} mm`;
}

/**
 * Tint subtil alinhado aos níveis: mesma cor das longarinas na elevação ({@link ELEV_BEAM_FILL}).
 * Opacidade 5–10% conforme o número de níveis estruturais.
 */
function moduleLevelTintFromMetadata(
  metadata: LayoutGeometry['metadata']
): FloorPlanModelV2['moduleLevelTint'] {
  const n = Math.max(1, metadata.structuralLevels);
  const opacity = Math.min(0.1, 0.05 + (n - 1) * 0.008);
  return {
    fill: ELEV_BEAM_FILL,
    opacity,
  };
}

function rackDepthModeFromRow(row: RackRow): RackDepthModeV2 {
  return row.rowType === 'backToBack' ? 'double' : 'single';
}

/** Ordem ao longo do vão (igual à cadeia de módulos na geometria). */
function beamStartMm(
  fp: RackModule['footprint'],
  orientation: LayoutGeometry['orientation']
): number {
  return orientation === 'along_length'
    ? Math.min(fp.x0, fp.x1)
    : Math.min(fp.y0, fp.y1);
}

function sortModulesAlongBeam(
  modules: RackModule[],
  orientation: LayoutGeometry['orientation']
): RackModule[] {
  return [...modules].sort(
    (a, b) => beamStartMm(a.footprint, orientation) - beamStartMm(b.footprint, orientation)
  );
}

/**
 * Evita cotar `circulationZones[0]` quando é só faixa residual (ex.: uma linha):
 * o rótulo deve corresponder à geometria cotada.
 * Preferência: corredor operacional entre fileiras → faixa transversal larga → passagem → primeira zona.
 */
function pickCorridorZoneForPlanDimension(
  zones: LayoutGeometry['circulationZones']
): LayoutGeometry['circulationZones'][number] | undefined {
  if (zones.length === 0) return undefined;
  const betweenRows = zones.find(z => z.label === 'Corredor operacional');
  if (betweenRows) return betweenRows;
  const wideTrailing = zones.find(
    z =>
      (z.label?.includes('Corredor operacional') ?? false) &&
      (z.label?.includes('faixa transversal') ?? false)
  );
  if (wideTrailing) return wideTrailing;
  const cross = zones.find(z => z.label?.includes('Passagem transversal'));
  if (cross) return cross;
  return zones[0];
}

/** Texto da cota alinhado à zona cotada e ao comprimento real nesse eixo. */
function corridorPlanDimensionLabel(
  zone: LayoutGeometry['circulationZones'][number],
  spanMm: number
): string {
  const fmt = formatMm(spanMm);
  const t = zone.label ?? '';
  if (t.includes('residual')) {
    return `Faixa transversal (residual): ${fmt}`;
  }
  if (t.includes('Passagem transversal')) {
    return `Passagem transversal: ${fmt}`;
  }
  if (t.includes('faixa transversal') && t.includes('Corredor')) {
    return `Corredor (faixa transversal): ${fmt}`;
  }
  return `Corredor operacional: ${fmt}`;
}

function circulationSemanticFromZone(
  kind: 'corridor' | 'tunnel',
  label: string | undefined
): FloorPlanCirculationSemantic {
  if (kind === 'tunnel') return 'tunnel';
  const t = label ?? '';
  if (
    t.includes('residual') ||
    t.includes('inferior ao corredor') ||
    t.includes('Faixa transversal residual')
  ) {
    return 'residual';
  }
  if (t.includes('Passagem transversal')) {
    return 'cross_passage';
  }
  return 'operational';
}

/** Retângulo da faixa da fileira no referencial do galpão (mm). */
function rowBandFootprintMm(row: RackRow): {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
} {
  if (row.layoutOrientation === 'along_length') {
    return {
      x0: row.originX,
      x1: row.originX + row.rowLengthMm,
      y0: row.originY,
      y1: row.originY + row.rowDepthMm,
    };
  }
  return {
    x0: row.originX,
    x1: row.originX + row.rowDepthMm,
    y0: row.originY,
    y1: row.originY + row.rowLengthMm,
  };
}

/**
 * Converte o modelo geométrico canónico num modelo de planta com coordenadas de desenho.
 */
export function buildFloorPlanModelV2(
  geometry: LayoutGeometry
): FloorPlanModelV2 {
  const { warehouseLengthMm: L, warehouseWidthMm: W } = geometry;
  const innerW = VB_W - 2 * PAD;
  const innerH = VB_H - PAD - HEADER - DIM_OUT - 28;
  const scale = Math.min(innerW / L, innerH / W);
  const boxW = L * scale;
  const boxH = W * scale;
  const bx = PAD + (innerW - boxW) / 2;
  const by = HEADER + (innerH - boxH) / 2;

  const toX = (xmm: number) => bx + xmm * scale;
  const toY = (ymm: number) => by + ymm * scale;

  const rowBandRects: FloorPlanModelV2['rowBandRects'] = [];
  geometry.rows.forEach((row, rowIndex) => {
    const r = rowBandFootprintMm(row);
    const nMod = row.modules.length;
    rowBandRects.push({
      id: `${row.id}-band`,
      x: toX(r.x0),
      y: toY(r.y0),
      w: Math.max(0.5, toX(r.x1) - toX(r.x0)),
      h: Math.max(0.5, toY(r.y1) - toY(r.y0)),
      kind: rackDepthModeFromRow(row),
      rowCaption: `Linha ${rowIndex + 1} — ${nMod} ${nMod === 1 ? 'módulo' : 'módulos'}`,
    });
  });

  const indexByModuleId = new Map<string, number>();
  let nextIdx = 1;
  for (const row of geometry.rows) {
    for (const m of sortModulesAlongBeam(row.modules, geometry.orientation)) {
      indexByModuleId.set(m.id, nextIdx++);
    }
  }

  const structureRects: FloorPlanModelV2['structureRects'] = [];
  for (const row of geometry.rows) {
    const kind = rackDepthModeFromRow(row);
    for (const m of row.modules) {
      const fp = m.footprint;
      structureRects.push({
        id: m.id,
        x: toX(fp.x0),
        y: toY(fp.y0),
        w: Math.max(0.5, toX(fp.x1) - toX(fp.x0)),
        h: Math.max(0.5, toY(fp.y1) - toY(fp.y0)),
        kind,
        variant: m.type === 'tunnel' ? 'tunnel' : 'normal',
        displayIndex: indexByModuleId.get(m.id),
      });
    }
  }

  const circulationRects: FloorPlanModelV2['circulationRects'] = [];

  for (const c of geometry.circulationZones) {
    circulationRects.push({
      id: c.id,
      x: toX(c.x0),
      y: toY(c.y0),
      w: Math.max(0.5, toX(c.x1) - toX(c.x0)),
      h: Math.max(0.5, toY(c.y1) - toY(c.y0)),
      kind: 'corridor',
      label: c.label,
      semantic: circulationSemanticFromZone('corridor', c.label),
    });
  }
  for (const t of geometry.tunnelOverlays) {
    circulationRects.push({
      id: t.id,
      x: toX(t.x0),
      y: toY(t.y0),
      w: Math.max(0.5, toX(t.x1) - toX(t.x0)),
      h: Math.max(0.5, toY(t.y1) - toY(t.y0)),
      kind: 'tunnel',
      label: t.label,
      semantic: 'tunnel',
    });
  }

  const dimensionLines: FloorPlanDimension[] = [];
  const dimY = by + boxH + 22;
  dimensionLines.push({
    id: 'dim-length',
    x1: bx,
    y1: dimY,
    x2: bx + boxW,
    y2: dimY,
    text: `Comprimento do galpão: ${formatMm(L)}`,
  });
  const dimX = bx - 44;
  dimensionLines.push({
    id: 'dim-width',
    x1: dimX,
    y1: by,
    x2: dimX,
    y2: by + boxH,
    text: `Largura do galpão: ${formatMm(W)}`,
    offset: -28,
  });

  const corridorZone = pickCorridorZoneForPlanDimension(geometry.circulationZones);
  if (corridorZone) {
    const c0 = corridorZone;
    const x0m = Math.min(c0.x0, c0.x1);
    const x1m = Math.max(c0.x0, c0.x1);
    const y0m = Math.min(c0.y0, c0.y1);
    const y1m = Math.max(c0.y0, c0.y1);
    const spanXm = Math.abs(x1m - x0m);
    const spanYm = Math.abs(y1m - y0m);
    const cx1 = toX(x0m);
    const cx2 = toX(x1m);
    const cy1 = toY(y0m);
    const cy2 = toY(y1m);
    const cw = Math.abs(cx2 - cx1);
    const ch = Math.abs(cy2 - cy1);
    const spanAlongDimensionMm = cw < ch ? spanXm : spanYm;
    const corText = corridorPlanDimensionLabel(c0, spanAlongDimensionMm);
    const cLeft = Math.min(cx1, cx2);
    const cRight = Math.max(cx1, cx2);
    const cTop = Math.min(cy1, cy2);
    const cBot = Math.max(cy1, cy2);
    const margin = 18;
    /** Cota fora da faixa do corredor — evita sobreposição com o rótulo semântico no interior. */
    if (cw < ch) {
      const canPlaceAbove = cTop > margin + 20;
      const yDim = canPlaceAbove ? cTop - margin : cBot + margin;
      const edgeY = canPlaceAbove ? cTop : cBot;
      const textY = canPlaceAbove ? yDim - 12 : yDim + 18;
      dimensionLines.push({
        id: 'dim-corridor',
        x1: cLeft,
        y1: yDim,
        x2: cRight,
        y2: yDim,
        text: corText,
        textMode: 'corridor-outside',
        extensions: [
          { x1: cLeft, y1: edgeY, x2: cLeft, y2: yDim },
          { x1: cRight, y1: edgeY, x2: cRight, y2: yDim },
        ],
        textAnchor: { x: (cLeft + cRight) / 2, y: textY },
        textRotateDeg: 0,
      });
    } else {
      const canPlaceLeft = cLeft > margin + 24;
      const xDim = canPlaceLeft ? cLeft - margin : cRight + margin;
      const edgeX = canPlaceLeft ? cLeft : cRight;
      const textX = canPlaceLeft ? xDim - 14 : xDim + 14;
      dimensionLines.push({
        id: 'dim-corridor',
        x1: xDim,
        y1: cTop,
        x2: xDim,
        y2: cBot,
        text: corText,
        textMode: 'corridor-outside',
        extensions: [
          { x1: edgeX, y1: cTop, x2: xDim, y2: cTop },
          { x1: edgeX, y1: cBot, x2: xDim, y2: cBot },
        ],
        textAnchor: { x: textX, y: (cTop + cBot) / 2 },
        textRotateDeg: -90,
      });
    }
  }

  const moduleLevelTint = moduleLevelTintFromMetadata(geometry.metadata);

  const labels: FloorPlanLabel[] = [
    {
      id: 'title',
      x: VB_W / 2,
      y: PAD + 24,
      text: 'PLANTA DE IMPLANTAÇÃO',
      className: 'fp-title',
    },
    {
      id: 'sub',
      x: VB_W / 2,
      y: PAD + 54,
      text: 'Layout dos módulos, corredores e túnel',
      className: 'fp-sub',
    },
    {
      id: 'sub-dims',
      x: VB_W / 2,
      y: PAD + 82,
      text: `${formatMm(L)} × ${formatMm(W)}`,
      className: 'fp-sub',
    },
    ...planCaptionLabels(geometry),
  ];

  return {
    viewBox: { w: VB_W, h: VB_H },
    warehouseOutline: { x: bx, y: by, w: boxW, h: boxH },
    beamSpanAlong: geometry.beamSpanDirection,
    rowBandRects,
    structureRects,
    circulationRects,
    dimensionLines,
    labels,
    moduleLevelTint,
  };
}

/** Legenda única dos números dos módulos (≈ posições por módulo). */
function planCaptionLabels(geometry: LayoutGeometry): FloorPlanLabel[] {
  const line: FloorPlanLabel = {
    id: 'cap-module-line',
    x: VB_W / 2,
    y: PAD + 110,
    text: planModuleSingleCaption(geometry),
    className: 'fp-plan-hint',
  };
  return [line];
}

function planModuleSingleCaption(geometry: LayoutGeometry): string {
  const { positionCount, moduleCount } = geometry.totals;
  if (
    moduleCount <= 0 ||
    !Number.isFinite(positionCount) ||
    !Number.isFinite(moduleCount)
  ) {
    return 'Cada número representa um módulo (ver resumo técnico)';
  }
  const approx = Math.round(positionCount / moduleCount);
  return `Cada número representa um módulo (≈${approx} posições)`;
}

export { escapeXml };
