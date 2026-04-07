/**
 * Tipos explícitos da pipeline PDF V2 (modelo geométrico + modelos visuais).
 * Coordenadas em mm no referencial do galpão: eixo X = comprimento, eixo Y = largura.
 */

/**
 * - `along_length`: vão / repetição ponta-a-ponta paralelos ao **comprimento** do galpão (eixo X na planta V2) — lado longo do módulo na horizontal do desenho.
 * - `along_width`: vão paralelos à **largura** (eixo Y) — lado longo do módulo na vertical do desenho.
 */
export type LayoutOrientationV2 = 'along_length' | 'along_width';

export type RackDepthModeV2 = 'single' | 'double';

export type LineStrategyCode =
  | 'APENAS_SIMPLES'
  | 'APENAS_DUPLOS'
  | 'MELHOR_LAYOUT';

export type TunnelPositionCode = 'INICIO' | 'MEIO' | 'FIM';

export type TunnelAppliesCode = 'LINHAS_SIMPLES' | 'LINHAS_DUPLOS' | 'AMBOS';

export type ModuleSegmentType = 'full' | 'half';

/** Variante de módulo: túnel = estrutura com vão livre em baixo e armazenagem acima. */
export type ModuleVariantV2 = 'normal' | 'tunnel';

export type CirculationKind = 'corridor' | 'tunnel';

/** Solução geométrica consolidada (sem instruções de desenho). */
export type LayoutSolutionV2 = {
  warehouse: { lengthMm: number; widthMm: number };
  orientation: LayoutOrientationV2;
  /** Profundidade escolhida para esta solução (simples vs dupla costas). */
  rackDepthMode: RackDepthModeV2;
  beamSpanMm: number;
  crossSpanMm: number;
  moduleWidthMm: number;
  moduleDepthMm: number;
  /**
   * Vão livre de **uma baia** ao longo da fileira (maior dimensão do par nos campos do fluxo).
   * A elevação frontal usa este valor por baia; não é o comprimento total do módulo em planta.
   */
  beamAlongModuleMm: number;
  /** Comprimento total de um módulo ao longo da fileira: 2 baias + montantes + folga entre baias (mm). */
  moduleLengthAlongBeamMm: number;
  /** Profundidade de posição, transversal ao vão (`moduleDepthMm`); dupla costas = 2× neste eixo + espinha. */
  rackDepthMm: number;
  corridorMm: number;
  rows: RackRowSolution[];
  corridors: CirculationZone[];
  tunnels: TunnelZone[];
  totals: {
    /** Células de vão (face) — meio módulo conta 0,5 quando aplicável. */
    modules: number;
    positions: number;
    levels: number;
  };
  metadata: {
    lineStrategy: LineStrategyCode;
    optimizeWithHalfModule: boolean;
    halfModuleRejectedReason?: string;
    firstLevelOnGround: boolean;
    hasTunnel: boolean;
  };
};

export type RackRowSolution = {
  id: string;
  kind: RackDepthModeV2;
  /** Retângulo da fileira em mm (galpão). */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  modules: ModuleSegment[];
};

export type ModuleSegment = {
  id: string;
  type: ModuleSegmentType;
  /** Por omissão trata-se como módulo normal. */
  variant?: ModuleVariantV2;
  /** Pé livre de passagem (mm) até ao 1.º eixo de longarina — só módulo túnel. */
  tunnelClearanceMm?: number;
  /** Níveis de armazenagem ativos acima do vão (referência; cotas vêm da geometria). */
  activeStorageLevels?: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
};

export type CirculationZone = {
  id: string;
  kind: CirculationKind;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  label?: string;
};

export type TunnelZone = CirculationZone & { kind: 'tunnel' };

/** Modelo de planta: entidades já posicionadas em unidades SVG (viewBox). */
export type FloorPlanModelV2 = {
  viewBox: { w: number; h: number };
  warehouseOutline: { x: number; y: number; w: number; h: number };
  /** Faixa da fileira (estrutura) por baixo dos módulos. */
  rowBandRects: {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    kind: RackDepthModeV2;
  }[];
  structureRects: {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    kind: RackDepthModeV2;
    variant?: ModuleVariantV2;
  }[];
  circulationRects: {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    kind: CirculationKind;
    label?: string;
  }[];
  dimensionLines: FloorPlanDimension[];
  labels: FloorPlanLabel[];
};

export type FloorPlanDimension = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  text: string;
  /** Offset normal à cota (px). */
  offset?: number;
};

export type FloorPlanLabel = {
  id: string;
  x: number;
  y: number;
  text: string;
  className?: string;
};

/** Dados para cada painel de elevação (sem coordenadas — o serializer posiciona). */
export type ElevationPanelPayload = {
  levels: number;
  uprightHeightMm: number;
  /**
   * Vão no plano da elevação **frontal**: extensão ao longo das longarinas (face de armazenagem).
   * Igual ao eixo comprimento do módulo na planta (`beamSpanMm` na geometria).
   */
  beamLengthMm: number;
  /** Profundidade de posição (mm), eixo da elevação **lateral** — transversal ao vão. */
  moduleDepthMm: number;
  /** Profundidade total da faixa em planta (simples = módulo; dupla costas = 2×módulo + espinha). */
  bandDepthMm: number;
  rackDepthMode: RackDepthModeV2;
  /** Corredor principal (mm) — contexto operacional no PDF. */
  corridorMm: number;
  capacityKgPerLevel: number;
  tunnel: boolean;
  /** Espessura representativa dos montantes (mm) — alinhada ao módulo de referência. */
  uprightThicknessMm?: number;
  /** Pé livre do módulo túnel (mm) — desenho do vão inferior. */
  tunnelClearanceMm?: number;
  firstLevelOnGround: boolean;
  clearHeightMm?: number;
  /** Cotas dos eixos das longarinas (mm, do piso), length = levels + 1 — de {@link computeBeamElevations}. */
  beamElevationsMm: number[];
  structuralBottomMm: number;
  structuralTopMm: number;
  usableHeightMm: number;
  meanGapMm: number;
};

export type ElevationModelV2 = {
  viewBoxW: number;
  viewBoxH: number;
  /** Vista frontal do módulo normal (sem vão de passagem) — linha de base para comparação. */
  frontWithoutTunnel: ElevationPanelPayload;
  /**
   * Vista frontal do módulo túnel (menos níveis ativos, vão inferior explícito).
   * Ausente quando o projeto não inclui módulo túnel.
   */
  frontWithTunnel?: ElevationPanelPayload;
  /** Vista lateral de apoio (geometria alinhada ao módulo normal). */
  lateral: ElevationPanelPayload;
  /**
   * Vista lateral do módulo túnel (abertura inferior, menos níveis) — só quando há túnel no projeto.
   */
  lateralWithTunnel?: ElevationPanelPayload;
  summaryLines: string[];
};

/** Segmento 3D em mm: X/Y = planta do galpão, Z = altura. */
export type Rack3DLine3D = {
  kind: 'upright' | 'beam' | 'floor';
  x1: number;
  y1: number;
  z1: number;
  x2: number;
  y2: number;
  z2: number;
};

/** Geometria wireframe derivada de {@link LayoutSolutionV2} (sem motor 3D). */
export type Rack3DModel = {
  warehouse: { lengthMm: number; widthMm: number };
  uprightHeightMm: number;
  levels: number;
  lines: Rack3DLine3D[];
};

export type ProjectedLine2D = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: 'upright' | 'beam' | 'floor';
};

/** Após projeção isométrica (unidades arbitrárias até encaixe no viewBox). */
export type Projected2D = {
  lines: ProjectedLine2D[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
};

/** Fragmento `<g>...</g>` ou documento SVG completo, conforme função. */
export type SvgGroup = string;
