import { sanitizeText } from '../../utils/sanitizeText';
import type { LayoutGeometry, RackModule, RackRow } from './layoutGeometryV2';
import { splitModuleFootprintsFor3d } from './model3dV2';
import type {
  FloorPlanCirculationSemantic,
  FloorPlanDimension,
  FloorPlanModelV2,
  LineStrategyCode,
  RackDepthModeV2,
} from './types';
import { buildFloorPlanAccessories } from './visualAccessoriesV2';
import { ELEV_BEAM_FILL } from './elevationVisualTokens';
import { topTravamentoPlanLinesMm } from './topTravamento';
import { resolveUprightHeightMmForProject } from '../projectEngines';
import { snapSvgExtentPx, svgGridMetrics } from './layoutGrid';

/**
 * Canvas SVG da planta.
 *
 * **Mesma convenção que {@link buildLayoutGeometry}:** retângulos em mm no referencial do galpão.
 * Em **dupla costas**, cada `RackModule` parte-se em **duas** pegadas (duas frentes de picking), como na
 * vista frontal / 3D — 1 módulo = 1 frente (2 baias), não o bloco fundido em profundidade.
 * O eixo **longitudinal da linha** é o do vão; o **transversal** é a profundidade de posição.
 * Não há segunda geometria aqui — só escala e projeção para o viewBox SVG.
 *
 * - Para L ≈ W, se `innerH` < `innerW`, `scale = innerH/W` fica baixo e o bitmap fica “paisagem”; no PDF
 *   o encaixe limita pela largura e sobra área em branco. Por isso `VB_H` é alto o suficiente
 *   para `innerH >= innerW` quando possível, e VB_W/VB_H ≈ 0,72 aproxima a zona útil A4 retrato.
 */
const VB_W = 1420;
const VB_H = 1980;
const _planGrid = svgGridMetrics(VB_W, VB_H);
const PAD = snapSvgExtentPx(_planGrid.rowH, 16, _planGrid.rowH);
/** Espaço superior sem título duplicado (o PDF traz o cabeçalho da folha). */
const HEADER = snapSvgExtentPx(_planGrid.rowH, 22, _planGrid.rowH);
const DIM_OUT = snapSvgExtentPx(_planGrid.rowH, 16, _planGrid.rowH);
/** Reserva à esquerda para cota de largura sem clip. */
const PLAN_LEFT_DIM_MARGIN_PX = snapSvgExtentPx(
  _planGrid.colW,
  54,
  _planGrid.colW
);
/** Reserva inferior para cotas + legenda no modelo (coordenadas mm→SVG). */
const PLAN_BOTTOM_STACK_RESERVE_PX = snapSvgExtentPx(
  _planGrid.rowH,
  235,
  _planGrid.rowH * 2
);
const PLAN_INNER_TOP_GAP_PX = snapSvgExtentPx(_planGrid.rowH, 18, _planGrid.rowH);
/** Espinha entre costas (mm) — igual a layoutGeometryV2 / model3dV2.splitModuleFootprintsFor3d. */

function escapeXml(text: string): string {
  return sanitizeText(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMm(mm: number): string {
  return `${Math.round(mm).toLocaleString('pt-BR')} mm`;
}

function layoutStrategyCaption(geometry: LayoutGeometry): string {
  const ls = geometry.metadata.lineStrategy;
  const depth =
    ls === 'PERSONALIZADO'
      ? 'composição personalizada (simples e/ou duplas)'
      : geometry.metadata.rackDepthMode === 'double'
        ? 'fileiras em dupla costas'
        : 'fileiras simples';
  const ori =
    geometry.orientation === 'along_length'
      ? 'vão das longarinas ∥ comprimento do compartimento'
      : 'vão das longarinas ∥ largura do compartimento';
  const strat: Record<LineStrategyCode, string> = {
    APENAS_SIMPLES: 'Estratégia: só linhas simples',
    APENAS_DUPLOS: 'Estratégia: só linhas duplas',
    MELHOR_LAYOUT: 'Estratégia: melhor layout (otimizado)',
    PERSONALIZADO: 'Estratégia: personalizada (N simples, M duplas)',
  };
  return `${strat[ls] ?? 'Estratégia de linhas'} · ${depth} · ${ori}`;
}

/**
 * Tint subtil alinhado aos níveis: mesma cor das longarinas na elevação ({@link ELEV_BEAM_FILL}).
 * Opacidade 5–10% conforme o número de níveis estruturais.
 */
function moduleLevelTintFromMetadata(
  metadata: LayoutGeometry['metadata']
): FloorPlanModelV2['moduleLevelTint'] {
  const n = Math.max(1, metadata.structuralLevels);
  const opacity = Math.min(0.032, 0.016 + (n - 1) * 0.0025);
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

/** Módulos de frente na fileira (dupla costas: 2× por segmento ao longo do vão; túnel: 1). */
function physicalPickingModuleCountForRow(row: RackRow): number {
  const ff = row.rowType === 'backToBack' ? 2 : 1;
  let n = 0;
  for (const m of row.modules) {
    const along = m.segmentType === 'half' ? 0.5 : 1;
    if (m.type === 'tunnel') {
      n += 1;
    } else {
      n += along * ff;
    }
  }
  return n;
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
    return `Largura — faixa transversal (residual): ${fmt}`;
  }
  if (t.includes('Passagem transversal')) {
    return `Largura — passagem transversal: ${fmt}`;
  }
  if (t.includes('faixa transversal') && t.includes('Corredor')) {
    return `Largura do corredor (faixa transversal): ${fmt}`;
  }
  return `Largura do corredor operacional: ${fmt}`;
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
 * Duas faixas paralelas + linha média da espinha (mm), alinhadas ao corte em
 * {@link splitModuleFootprintsFor3d} (1.ª face = A em menor Y ou menor X).
 */
function doubleRowFaceBandsMm(
  row: RackRow,
  rackDepthMm: number,
  spineBackToBackMm: number
): {
  faceAMm: { x0: number; y0: number; x1: number; y1: number };
  faceBMm: { x0: number; y0: number; x1: number; y1: number };
  spineMidlineMm: { x1: number; y1: number; x2: number; y2: number };
} | null {
  if (row.rowType !== 'backToBack') return null;
  const r = rowBandFootprintMm(row);
  const md = rackDepthMm;
  const sp = spineBackToBackMm;
  if (row.layoutOrientation === 'along_length') {
    const ySplitFront = r.y0 + md;
    const ySplitBack = ySplitFront + sp;
    const yMid = ySplitFront + sp / 2;
    return {
      faceAMm: { x0: r.x0, y0: r.y0, x1: r.x1, y1: ySplitFront },
      faceBMm: { x0: r.x0, y0: ySplitBack, x1: r.x1, y1: r.y1 },
      spineMidlineMm: { x1: r.x0, y1: yMid, x2: r.x1, y2: yMid },
    };
  }
  const xSplitFront = r.x0 + md;
  const xSplitBack = xSplitFront + sp;
  const xMid = xSplitFront + sp / 2;
  return {
    faceAMm: { x0: r.x0, y0: r.y0, x1: xSplitFront, y1: r.y1 },
    faceBMm: { x0: xSplitBack, y0: r.y0, x1: r.x1, y1: r.y1 },
    spineMidlineMm: { x1: xMid, y1: r.y0, x2: xMid, y2: r.y1 },
  };
}

/**
 * Converte o modelo geométrico canónico num modelo de planta com coordenadas de desenho.
 */
export function buildFloorPlanModelV2(
  geometry: LayoutGeometry,
  answers?: Record<string, unknown>
): FloorPlanModelV2 {
  const { warehouseLengthMm: L, warehouseWidthMm: W } = geometry;
  const innerW = VB_W - 2 * PAD;
  const innerH = VB_H - PAD - HEADER - DIM_OUT - PLAN_INNER_TOP_GAP_PX;
  const drawableW = Math.max(120, innerW - PLAN_LEFT_DIM_MARGIN_PX);
  const drawableH = Math.max(120, innerH - PLAN_BOTTOM_STACK_RESERVE_PX);
  const scale = Math.min(drawableW / L, drawableH / W);
  const boxW = L * scale;
  const boxH = W * scale;
  const bx = PAD + PLAN_LEFT_DIM_MARGIN_PX + (drawableW - boxW) / 2;
  const by = HEADER + (drawableH - boxH) / 2;

  const toX = (xmm: number) => bx + xmm * scale;
  const toY = (ymm: number) => by + ymm * scale;

  const rackDepthMm = geometry.metadata.rackDepthMm;
  const spineMm = geometry.metadata.spineBackToBackMm;
  const rowBandRects: FloorPlanModelV2['rowBandRects'] = [];
  const rowSpineGapRects: FloorPlanModelV2['rowSpineGapRects'] = [];
  const rowSpineLines: FloorPlanModelV2['rowSpineLines'] = [];

  function mmRectToBand(
    id: string,
    mm: { x0: number; y0: number; x1: number; y1: number },
    kind: RackDepthModeV2,
    caption: string,
    opts: {
      showInRowLegend?: boolean;
      pickingFace?: 'A' | 'B';
      spineFacingEdge?: FloorPlanModelV2['rowBandRects'][0]['spineFacingEdge'];
    }
  ): void {
    const x0 = Math.min(mm.x0, mm.x1);
    const x1 = Math.max(mm.x0, mm.x1);
    const y0 = Math.min(mm.y0, mm.y1);
    const y1 = Math.max(mm.y0, mm.y1);
    rowBandRects.push({
      id,
      x: toX(x0),
      y: toY(y0),
      w: Math.max(0.5, toX(x1) - toX(x0)),
      h: Math.max(0.5, toY(y1) - toY(y0)),
      kind,
      rowCaption: caption,
      showInRowLegend: opts.showInRowLegend,
      pickingFace: opts.pickingFace,
      spineFacingEdge: opts.spineFacingEdge,
    });
  }

  function mmSpineGapToRect(
    id: string,
    mm: { x0: number; y0: number; x1: number; y1: number }
  ): void {
    const x0 = Math.min(mm.x0, mm.x1);
    const x1 = Math.max(mm.x0, mm.x1);
    const y0 = Math.min(mm.y0, mm.y1);
    const y1 = Math.max(mm.y0, mm.y1);
    rowSpineGapRects.push({
      id,
      x: toX(x0),
      y: toY(y0),
      w: Math.max(0.5, toX(x1) - toX(x0)),
      h: Math.max(0.5, toY(y1) - toY(y0)),
    });
  }

  geometry.rows.forEach((row, rowIndex) => {
    const kind = rackDepthModeFromRow(row);
    const nMod = physicalPickingModuleCountForRow(row);
    const caption = `Linha ${rowIndex + 1} — ${nMod} ${nMod === 1 ? 'módulo' : 'módulos'}`;

    if (kind === 'double') {
      const split = doubleRowFaceBandsMm(row, rackDepthMm, spineMm);
      if (split) {
        const { faceAMm, faceBMm, spineMidlineMm } = split;
        const lo = row.layoutOrientation;
        /** Aresta da faixa voltada para o canal da espinha (referencial SVG do retângulo). */
        const spineEdgeA =
          lo === 'along_length' ? ('max_y' as const) : ('max_x' as const);
        const spineEdgeB =
          lo === 'along_length' ? ('min_y' as const) : ('min_x' as const);
        mmRectToBand(`${row.id}-band-a`, faceAMm, kind, caption, {
          showInRowLegend: true,
          pickingFace: 'A',
          spineFacingEdge: spineEdgeA,
        });
        mmRectToBand(`${row.id}-band-b`, faceBMm, kind, caption, {
          showInRowLegend: false,
          pickingFace: 'B',
          spineFacingEdge: spineEdgeB,
        });
        const gx0 = Math.min(faceAMm.x0, faceAMm.x1, faceBMm.x0, faceBMm.x1);
        const gx1 = Math.max(faceAMm.x0, faceAMm.x1, faceBMm.x0, faceBMm.x1);
        const gy0 = Math.min(faceAMm.y0, faceAMm.y1, faceBMm.y0, faceBMm.y1);
        const gy1 = Math.max(faceAMm.y0, faceAMm.y1, faceBMm.y0, faceBMm.y1);
        if (lo === 'along_length') {
          const ySplitFront = Math.min(faceAMm.y0, faceAMm.y1) + rackDepthMm;
          const ySplitBack = ySplitFront + spineMm;
          mmSpineGapToRect(`${row.id}-spine-gap`, {
            x0: gx0,
            y0: ySplitFront,
            x1: gx1,
            y1: ySplitBack,
          });
        } else {
          const xSplitFront = Math.min(faceAMm.x0, faceAMm.x1) + rackDepthMm;
          const xSplitBack = xSplitFront + spineMm;
          mmSpineGapToRect(`${row.id}-spine-gap`, {
            x0: xSplitFront,
            y0: gy0,
            x1: xSplitBack,
            y1: gy1,
          });
        }
        rowSpineLines.push({
          id: `${row.id}-spine`,
          x1: toX(spineMidlineMm.x1),
          y1: toY(spineMidlineMm.y1),
          x2: toX(spineMidlineMm.x2),
          y2: toY(spineMidlineMm.y2),
        });
        return;
      }
    }

    const r = rowBandFootprintMm(row);
    mmRectToBand(`${row.id}-band`, r, kind, caption, {});
  });

  const structureRects: FloorPlanModelV2['structureRects'] = [];
  let nextDisplayIdx = 1;
  const ori = geometry.orientation;
  for (const row of geometry.rows) {
    const kind = rackDepthModeFromRow(row);
    const sorted = sortModulesAlongBeam(row.modules, geometry.orientation);
    for (const m of sorted) {
      const fps = splitModuleFootprintsFor3d(
        row,
        m,
        rackDepthMm,
        ori,
        spineMm
      );
      let fi = 0;
      for (const fp of fps) {
        const x0 = Math.min(fp.x0, fp.x1);
        const x1 = Math.max(fp.x0, fp.x1);
        const y0 = Math.min(fp.y0, fp.y1);
        const y1 = Math.max(fp.y0, fp.y1);
        const id = fps.length > 1 ? `${m.id}-f${fi}` : m.id;
        fi += 1;
        structureRects.push({
          id,
          x: toX(x0),
          y: toY(y0),
          w: Math.max(0.5, toX(x1) - toX(x0)),
          h: Math.max(0.5, toY(y1) - toY(y0)),
          kind,
          variant: m.type === 'tunnel' ? 'tunnel' : 'normal',
          segmentType: m.type === 'tunnel' ? undefined : m.segmentType,
          displayIndex: nextDisplayIdx++,
        });
      }
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
  /**
   * Perímetro exterior “visual” da planta — alinhado ao tracejado SVG (`warehouseOutline ± 5`).
   * Cotas paralelas ficam **fora** deste envelope para não cortar módulos nem cruzar linhas de fluxo.
   */
  const envPad = 5;
  const envBottom = by + boxH + envPad;
  const envLeft = bx - envPad;
  const envRight = bx + boxW + envPad;

  /**
   * Faixas de cota (lanes) — evita colisão entre “Comprimento total”, corredor operacional e largura total.
   * Inferior: laneBottomSecondary (corredor horizontal, se existir) mais perto do desenho;
   * laneBottomMain = comprimento total (fora).
   * Esquerda: laneLeftSecondary (corredor vertical); laneLeftMain = largura total (fora).
   */
  const DIM_TICK_PX = 6.5;
  const DIM_HORIZONTAL_STACK_GAP_PX = 12;
  const DIM_TEXT_ABOVE_LINE_PX = 14;
  /** Da linha de cota secundária inferior à linha de cota principal (comprimento total). */
  const DIM_LANE_BOTTOM_MAIN_OFFSET_PX =
    DIM_TICK_PX + DIM_HORIZONTAL_STACK_GAP_PX + DIM_TEXT_ABOVE_LINE_PX + 48;
  /** Espaço horizontal entre linha de cota do corredor (vertical) e linha da largura total. */
  const DIM_LANE_LEFT_MAIN_OFFSET_PX = Math.max(
    38,
    18 + DIM_HORIZONTAL_STACK_GAP_PX + 18
  );

  const dimStripeGap = 18;
  const flushThresh = Math.min(36, Math.max(12, Math.min(boxW, boxH) * 0.038));

  let corridorHorizY: number | undefined;
  /** Cotável à esquerda do envelope quando há cota vertical secundária (desloca a largura total mais para fora). */
  let corridorVertInnerLeftX: number | undefined;

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

    const tolL = Math.max(120, L * 0.035);
    const tolW = Math.max(120, W * 0.035);
    const redundantHoriz =
      cw < ch &&
      (cRight - cLeft) >= boxW * 0.9 &&
      Math.abs(spanXm - L) <= tolL;
    const redundantVert =
      cw >= ch &&
      (cBot - cTop) >= boxH * 0.9 &&
      Math.abs(spanYm - W) <= tolW;

    /** Corredor encostado ao limite inferior — prolongamentos só na margem, sem atravessar picking. */
    const bottomFlushCorridor = cBot >= by + boxH - flushThresh;
    const leftFlushCorridor = cLeft <= bx + flushThresh;
    const rightFlushCorridor = cRight >= bx + boxW - flushThresh;

    if (cw < ch && !redundantHoriz && bottomFlushCorridor) {
      const laneBottomSecondaryY = Math.max(envBottom + dimStripeGap, cBot + DIM_HORIZONTAL_STACK_GAP_PX);
      corridorHorizY = laneBottomSecondaryY;
      const yDim = laneBottomSecondaryY;
      /** Texto acima da linha de cota — nunca partilha baseline com “Comprimento total”. */
      const corridorTextY = yDim - DIM_TEXT_ABOVE_LINE_PX;
      dimensionLines.push({
        id: 'dim-corridor',
        x1: cLeft,
        y1: yDim,
        x2: cRight,
        y2: yDim,
        text: corText,
        textMode: 'corridor-outside',
        extensions: [
          { x1: cLeft, y1: cBot, x2: cLeft, y2: yDim },
          { x1: cRight, y1: cBot, x2: cRight, y2: yDim },
        ],
        textAnchor: { x: (cLeft + cRight) / 2, y: corridorTextY },
        textRotateDeg: 0,
        dimTier: 'secondary',
      });
    } else if (cw >= ch && !redundantVert) {
      if (leftFlushCorridor) {
        const laneLeftSecondaryX = Math.min(envLeft - dimStripeGap, cLeft - DIM_HORIZONTAL_STACK_GAP_PX);
        corridorVertInnerLeftX = laneLeftSecondaryX;
        const xDim = laneLeftSecondaryX;
        /** Rótulo à esquerda da linha — folga explícita da faixa da largura total. */
        const textX = xDim - DIM_TEXT_ABOVE_LINE_PX - 10;
        dimensionLines.push({
          id: 'dim-corridor',
          x1: xDim,
          y1: cTop,
          x2: xDim,
          y2: cBot,
          text: corText,
          textMode: 'corridor-outside',
          extensions: [
            { x1: cLeft, y1: cTop, x2: xDim, y2: cTop },
            { x1: cLeft, y1: cBot, x2: xDim, y2: cBot },
          ],
          textAnchor: { x: textX, y: (cTop + cBot) / 2 },
          textRotateDeg: -90,
          dimTier: 'secondary',
        });
      } else if (rightFlushCorridor) {
        const laneRightSecondaryX = Math.max(envRight + dimStripeGap, cRight + DIM_HORIZONTAL_STACK_GAP_PX);
        const xDim = laneRightSecondaryX;
        const textX = xDim + DIM_TEXT_ABOVE_LINE_PX + 10;
        dimensionLines.push({
          id: 'dim-corridor',
          x1: xDim,
          y1: cTop,
          x2: xDim,
          y2: cBot,
          text: corText,
          textMode: 'corridor-outside',
          extensions: [
            { x1: cRight, y1: cTop, x2: xDim, y2: cTop },
            { x1: cRight, y1: cBot, x2: xDim, y2: cBot },
          ],
          textAnchor: { x: textX, y: (cTop + cBot) / 2 },
          textRotateDeg: -90,
          dimTier: 'secondary',
        });
      }
    }
  }

  const laneBottomMainY =
    corridorHorizY !== undefined
      ? corridorHorizY + DIM_LANE_BOTTOM_MAIN_OFFSET_PX
      : envBottom + dimStripeGap;
  const dimLengthY = laneBottomMainY;

  dimensionLines.push({
    id: 'dim-length',
    x1: bx,
    y1: dimLengthY,
    x2: bx + boxW,
    y2: dimLengthY,
    text: `Comprimento total: ${formatMm(L)}`,
    dimTier: 'primary',
  });

  const laneLeftMainX =
    corridorVertInnerLeftX !== undefined
      ? corridorVertInnerLeftX - DIM_LANE_LEFT_MAIN_OFFSET_PX
      : envLeft - dimStripeGap;
  const dimWidthX = laneLeftMainX;

  dimensionLines.push({
    id: 'dim-width',
    x1: dimWidthX,
    y1: by,
    x2: dimWidthX,
    y2: by + boxH,
    text: `Largura total: ${formatMm(W)}`,
    offset: -28,
    dimTier: 'primary',
  });

  const meta = geometry.metadata;
  const bayClearSpanNote =
    meta.beamAlongModuleMm > 0
      ? `Vão por baia (referência): ${formatMm(meta.beamAlongModuleMm)}`
      : undefined;

  const moduleLevelTint = moduleLevelTintFromMetadata(geometry.metadata);

  const rowBandsForLegend = rowBandRects.filter(
    r => r.showInRowLegend !== false
  );

  const planAccessories = buildFloorPlanAccessories(answers, geometry);

  const uprightH = resolveUprightHeightMmForProject(answers ?? {});
  const topTravamentoLines: FloorPlanModelV2['topTravamentoLines'] =
    topTravamentoPlanLinesMm(geometry, uprightH).map(ln => ({
      id: ln.id,
      x1: toX(ln.x0),
      y1: toY(ln.y0),
      x2: toX(ln.x1),
      y2: toY(ln.y1),
    }));

  const hasTunnelOverlayZones = geometry.tunnelOverlays.length > 0;
  const hasCrossPassageZone = geometry.circulationZones.some(z =>
    (z.label ?? '').includes('Passagem transversal')
  );
  const tunnelOperationHint = geometry.metadata.hasTunnel
    ? geometry.rows.length > 1
      ? 'Ligação entre fileiras · trânsito ao piso com picking nos níveis superiores'
      : 'Passagem ao piso · picking nos patamares acima do vão'
    : hasCrossPassageZone || hasTunnelOverlayZones
      ? 'Faixas de passagem ao piso no desenho: circulação; picking nos níveis superiores (quando aplicável).'
      : undefined;

  const planLegendNotes = {
    moduleIndexHint: planModuleSingleCaption(geometry),
    firstLevelHint: planAccessories.firstLevelOnGround
      ? '1.º eixo de feixe: ao piso (referência).'
      : '1.º eixo de feixe: elevado — folga sob o 1.º patamar (referência).',
    implantHint:
      'Módulos = picking · corredores = circulação do empilhador · tracejado exterior = limite do compartimento.',
    strategyHint: layoutStrategyCaption(geometry),
    rowLines: rowBandsForLegend.map(r => r.rowCaption),
    tunnelNote: tunnelOperationHint,
    bayClearSpanNote,
  };

  return {
    viewBox: { w: VB_W, h: VB_H },
    warehouseOutline: { x: bx, y: by, w: boxW, h: boxH },
    beamSpanAlong: geometry.beamSpanDirection,
    planAccessories,
    rowBandRects,
    rowSpineGapRects,
    rowSpineLines,
    topTravamentoLines,
    structureRects,
    circulationRects,
    dimensionLines,
    labels: [],
    moduleLevelTint,
    tunnelOperationHint,
    planLegendNotes,
  };
}

function planModuleSingleCaption(geometry: LayoutGeometry): string {
  const { positionCount, physicalPickingModuleCount, moduleCount } =
    geometry.totals;
  const faceMods = physicalPickingModuleCount ?? moduleCount;
  if (
    faceMods <= 0 ||
    !Number.isFinite(positionCount) ||
    !Number.isFinite(faceMods)
  ) {
    return 'Cada número representa um módulo de frente (2 baias), ver resumo técnico';
  }
  const approx = Math.round(positionCount / faceMods);
  return `Cada número = 1 módulo de frente (2 baias) (≈${approx} posições por módulo)`;
}

export { escapeXml };
