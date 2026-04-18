import { sanitizeText } from '../../utils/sanitizeText';
import type { LayoutGeometry, RackModule, RackRow } from './layoutGeometryV2';
import { splitModuleFootprintsFor3d } from './model3dV2';
import type {
  FloorPlanCirculationSemantic,
  FloorPlanDimension,
  FloorPlanLabel,
  FloorPlanModelV2,
  LineStrategyCode,
  RackDepthModeV2,
} from './types';
import { buildFloorPlanAccessories } from './visualAccessoriesV2';
import { ELEV_BEAM_FILL } from './elevationVisualTokens';

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
const PAD = 16;
/** Espaço superior sem título duplicado (o PDF traz o cabeçalho da folha). */
const HEADER = 22;
const DIM_OUT = 16;
/** Espinha entre costas (mm) — igual a layoutGeometryV2 / model3dV2.splitModuleFootprintsFor3d. */
const SPINE_BACK_TO_BACK_MM = 100;

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
    geometry.metadata.rackDepthMode === 'double'
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
  };
  return `${strat[ls] ?? 'Estratégia de linhas'} · ${depth} · ${ori}`;
}

function buildRowLineMarkersFromBands(
  rowBandRects: FloorPlanModelV2['rowBandRects'],
  beamSpanDirection: 'x' | 'y'
): NonNullable<FloorPlanModelV2['rowLineMarkers']> {
  const out: NonNullable<FloorPlanModelV2['rowLineMarkers']> = [];
  for (const r of rowBandRects) {
    if (r.showInRowLegend === false) continue;
    const lineOnly = r.rowCaption.split('—')[0]?.trim() ?? r.rowCaption;
    const fs = Math.max(9, Math.min(13, Math.min(r.w, r.h) * 0.052));
    if (beamSpanDirection === 'x') {
      out.push({
        id: `row-m-${r.id}`,
        text: lineOnly,
        x: r.x + 4,
        y: r.y + fs + 1,
        fontSize: fs,
      });
    } else {
      out.push({
        id: `row-m-${r.id}`,
        text: lineOnly,
        x: r.x + fs + 3,
        y: r.y + r.h / 2 + fs * 0.2,
        fontSize: fs,
      });
    }
  }
  return out;
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
 * Duas faixas paralelas + linha média da espinha (mm), alinhadas ao corte em
 * {@link splitModuleFootprintsFor3d} (1.ª face = A em menor Y ou menor X).
 */
function doubleRowFaceBandsMm(
  row: RackRow,
  rackDepthMm: number
): {
  faceAMm: { x0: number; y0: number; x1: number; y1: number };
  faceBMm: { x0: number; y0: number; x1: number; y1: number };
  spineMidlineMm: { x1: number; y1: number; x2: number; y2: number };
} | null {
  if (row.rowType !== 'backToBack') return null;
  const r = rowBandFootprintMm(row);
  const md = rackDepthMm;
  const sp = SPINE_BACK_TO_BACK_MM;
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
  const innerH = VB_H - PAD - HEADER - DIM_OUT - 18;
  const scale = Math.min(innerW / L, innerH / W);
  const boxW = L * scale;
  const boxH = W * scale;
  const bx = PAD + (innerW - boxW) / 2;
  const by = HEADER + (innerH - boxH) / 2;

  const toX = (xmm: number) => bx + xmm * scale;
  const toY = (ymm: number) => by + ymm * scale;

  const rackDepthMm = geometry.metadata.rackDepthMm;
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
      const split = doubleRowFaceBandsMm(row, rackDepthMm);
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
          const ySplitBack = ySplitFront + SPINE_BACK_TO_BACK_MM;
          mmSpineGapToRect(`${row.id}-spine-gap`, {
            x0: gx0,
            y0: ySplitFront,
            x1: gx1,
            y1: ySplitBack,
          });
        } else {
          const xSplitFront = Math.min(faceAMm.x0, faceAMm.x1) + rackDepthMm;
          const xSplitBack = xSplitFront + SPINE_BACK_TO_BACK_MM;
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
      const fps = splitModuleFootprintsFor3d(row, m, rackDepthMm, ori);
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
  const dimY = by + boxH + 22;
  dimensionLines.push({
    id: 'dim-length',
    x1: bx,
    y1: dimY,
    x2: bx + boxW,
    y2: dimY,
    text: `Comprimento do galpão: ${formatMm(L)}`,
    dimTier: 'primary',
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
    dimTier: 'primary',
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
        dimTier: 'secondary',
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
        dimTier: 'secondary',
      });
    }
  }

  const meta = geometry.metadata;
  const bayRef = structureRects.find(
    s =>
      s.variant !== 'tunnel' &&
      Math.min(s.w, s.h) > 35 &&
      meta.beamAlongModuleMm > 0
  );
  if (bayRef) {
    const halfMod = bayRef.segmentType === 'half';
    const t0 = halfMod ? 0.08 : 0.25;
    const t1 = halfMod ? 0.92 : 0.75;
    const bayText = `Vão por baia: ${formatMm(meta.beamAlongModuleMm)}`;
    const alongX = geometry.beamSpanDirection === 'x';
    if (alongX) {
      const yB = bayRef.y + bayRef.h - 12;
      dimensionLines.push({
        id: 'dim-bay',
        x1: bayRef.x + bayRef.w * t0,
        y1: yB,
        x2: bayRef.x + bayRef.w * t1,
        y2: yB,
        text: bayText,
        dimTier: 'detail',
      });
    } else {
      const xB = bayRef.x + Math.min(20, bayRef.w * 0.18);
      dimensionLines.push({
        id: 'dim-bay',
        x1: xB,
        y1: bayRef.y + bayRef.h * t0,
        x2: xB,
        y2: bayRef.y + bayRef.h * t1,
        text: bayText,
        textMode: 'corridor-inline',
        dimTier: 'detail',
      });
    }
  }

  const moduleLevelTint = moduleLevelTintFromMetadata(geometry.metadata);

  const rowLegendBaseY = by + boxH + 56;
  const rowBandsForLegend = rowBandRects.filter(
    r => r.showInRowLegend !== false
  );
  const rowLegendBlock: FloorPlanLabel[] =
    rowBandsForLegend.length === 0
      ? []
      : [
          {
            id: 'row-leg-heading',
            x: VB_W / 2,
            y: rowLegendBaseY,
            text: 'Fileiras (referência)',
            className: 'fp-anno-heading',
          },
          ...rowBandsForLegend.map((r, i) => ({
            id: `row-leg-${r.id}`,
            x: VB_W / 2,
            y: rowLegendBaseY + 22 + i * 19,
            text: r.rowCaption,
            className: 'fp-row-legend',
          })),
        ];

  const planAccessories = buildFloorPlanAccessories(answers, geometry);

  const labels: FloorPlanLabel[] = [
    {
      id: 'sub-dims',
      x: VB_W / 2,
      y: PAD + 16,
      text: `Dimensões do compartimento: ${formatMm(L)} × ${formatMm(W)}`,
      className: 'fp-drawing-meta',
    },
    ...planCaptionLabels(geometry, planAccessories),
    ...rowLegendBlock,
  ];

  const rowLineMarkers = buildRowLineMarkersFromBands(
    rowBandRects,
    geometry.beamSpanDirection
  );

  const tunnelOperationHint = geometry.metadata.hasTunnel
    ? geometry.rows.length > 1
      ? 'Ligação entre fileiras · trânsito ao piso com picking nos níveis superiores'
      : 'Passagem ao piso · picking nos patamares acima do vão'
    : undefined;

  return {
    viewBox: { w: VB_W, h: VB_H },
    warehouseOutline: { x: bx, y: by, w: boxW, h: boxH },
    beamSpanAlong: geometry.beamSpanDirection,
    planAccessories,
    rowBandRects,
    rowSpineGapRects,
    rowSpineLines,
    structureRects,
    circulationRects,
    dimensionLines,
    labels,
    moduleLevelTint,
    rowLineMarkers,
    tunnelOperationHint,
  };
}

/** Legenda única dos números dos módulos (≈ posições por módulo) + leitura do 1.º nível. */
function planCaptionLabels(
  geometry: LayoutGeometry,
  planAccessories: FloorPlanModelV2['planAccessories']
): FloorPlanLabel[] {
  const line: FloorPlanLabel = {
    id: 'cap-module-line',
    x: VB_W / 2,
    y: PAD + 34,
    text: planModuleSingleCaption(geometry),
    className: 'fp-plan-hint',
  };
  const firstLevel: FloorPlanLabel = {
    id: 'cap-first-level',
    x: VB_W / 2,
    y: PAD + 50,
    text: planAccessories.firstLevelOnGround
      ? '1.º eixo de feixe: ao piso (referência)'
      : '1.º eixo de feixe: elevado — folga sob o primeiro patamar (referência)',
    className: 'fp-first-level',
  };
  const implant: FloorPlanLabel = {
    id: 'cap-implant',
    x: VB_W / 2,
    y: PAD + 68,
    text:
      'Implantação: módulos = picking · corredores = circulação de empilhador · limite do compartimento em tracejado',
    className: 'fp-implantacao-hint',
  };
  const strategy: FloorPlanLabel = {
    id: 'cap-strategy',
    x: VB_W / 2,
    y: PAD + 86,
    text: layoutStrategyCaption(geometry),
    className: 'fp-strategy-hint',
  };
  return [line, firstLevel, implant, strategy];
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
