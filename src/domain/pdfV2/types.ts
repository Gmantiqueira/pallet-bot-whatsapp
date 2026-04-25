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
  | 'MELHOR_LAYOUT'
  | 'PERSONALIZADO';

/** Compatível com START / MIDDLE / END (API em inglês). */
export type TunnelPositionCode = 'INICIO' | 'MEIO' | 'FIM';

/**
 * - `LINHAS_SIMPLES` / `LINHAS_DUPLOS`: módulo túnel só em fileiras simples ou só em dupla costas.
 * - `AMBOS`: em todas as fileiras geradas (que respeitem o modo de profundidade).
 * - `UMA`: módulo túnel em **uma única** fileira — a primeira na ordem de implantação (menor faixa transversal).
 */
export type TunnelAppliesCode =
  | 'LINHAS_SIMPLES'
  | 'LINHAS_DUPLOS'
  | 'AMBOS'
  | 'UMA';

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
   * Vão livre de **uma baia** ao longo das longarinas (`moduleWidthMm` / `beamLengthMm`).
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
    /**
     * Equivalente ao longo do vão por segmento de layout (1 = módulo completo ao longo da fileira,
     * 0,5 = meio módulo) — usado no motor de pontuação e coerência com modelo 3D equiv.
     */
    modules: number;
    /**
     * Módulos de **frente** (faces de picking): em linha dupla costas, cada segmento conta ×2;
     * túnel = 1 unidade. Alinha numeração da planta e resumo ao conceito da vista frontal (2 baias / frente).
     */
    physicalPickingModules: number;
    positions: number;
    /**
     * Total de patamares de armazenagem no cálculo de posições (= níveis com longarina
     * + 1 se `hasGroundLevel`).
     */
    levels: number;
  };
  metadata: {
    lineStrategy: LineStrategyCode;
    /**
     * Estratégia PERSONALIZADO: nº de fileiras simples e duplas pedidas; implantação transversal
     * na ordem **duplas → simples** (igual extensão natural do motor em dupla + simples remanescente).
     */
    customLineCounts?: { simple: number; double: number };
    optimizeWithHalfModule: boolean;
    halfModuleRejectedReason?: string;
    firstLevelOnGround: boolean;
    /** Níveis com longarina (entrada do utilizador). */
    structuralLevels: number;
    /** Patamar de palete no piso sem longarina. */
    hasGroundLevel: boolean;
    hasTunnel: boolean;
    /**
     * Vãos de túnel (INICIO/MEIO/FIM cada), quando a configuração usa vários túneis;
     * omisso: usar só `tunnelPosition` ou o equivalente.
     */
    tunnelPlacements?: readonly TunnelPositionCode[];
    /** Onde aplicável: posição do vão (túnel / passagem) usada nesta solução. */
    tunnelPosition?: TunnelPositionCode;
    /** Início efetivo do vão ao longo do `beamSpanMm` (mm), após limites geométricos. */
    tunnelOffsetEffectiveMm?: number;
    /**
     * Extensão ao longo do vão ocupada por módulos (full/half) **sem** contar faixa vazia residual
     * no fim do compartimento — usada para INICIO/MEIO/FIM relativos à fileira operacional.
     */
    tunnelOperationalExtentMm?: number;
    /**
     * Largura da espinha / “rua” entre as duas costas numa fileira dupla (mm). Igual à entrada
     * do distanciador no fluxo; o motor de layout usa o mesmo valor na banda `2×prof + espinha`.
     * Omisso em testes: tratar como 100 mm.
     */
    spineBackToBackMm?: number;
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

/** Papel da zona na planta (só representação). */
export type FloorPlanCirculationSemantic =
  | 'operational'
  | 'residual'
  | 'cross_passage'
  | 'tunnel';

/** Posição da guarda-corpo ao longo do vão (fileira). */
export type GuardRailPositionCode = 'INICIO' | 'FINAL' | 'AMBOS';

/** Opções de projeto espelhadas no desenho (planta). */
export type FloorPlanAccessoriesV2 = {
  columnProtector: boolean;
  guardRailSimple: boolean;
  guardRailSimplePosition?: GuardRailPositionCode;
  guardRailDouble: boolean;
  guardRailDoublePosition?: GuardRailPositionCode;
  firstLevelOnGround: boolean;
};

/** Modelo de planta: entidades já posicionadas em unidades SVG (viewBox). */
export type FloorPlanModelV2 = {
  viewBox: { w: number; h: number };
  warehouseOutline: { x: number; y: number; w: number; h: number };
  /** Direção do vão das longarinas no plano (eixo das linhas de armazenagem). */
  beamSpanAlong: 'x' | 'y';
  /** Protetores de coluna, guardas e leitura do 1.º nível — mesmo critério do resumo técnico. */
  planAccessories: FloorPlanAccessoriesV2;
  /** Faixa da fileira (estrutura) por baixo dos módulos. */
  rowBandRects: {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    kind: RackDepthModeV2;
    /** Uma linha: "Linha N — X módulos". */
    rowCaption: string;
    /** Segunda faixa de uma dupla: não repetir na legenda "Fileiras". */
    showInRowLegend?: boolean;
    /** Dupla costas: frente de picking (alinhado ao 1.º / 2.º split da pegada). */
    pickingFace?: 'A' | 'B';
    /**
     * Dupla costas: aresta da faixa voltada para a espinha (canal entre costas).
     * Usado na planta para não desenhar contorno forte nessa aresta — duas estruturas independentes.
     */
    spineFacingEdge?: 'min_x' | 'max_x' | 'min_y' | 'max_y';
  }[];
  /** Dupla costas: faixa do canal entre as duas frentes (espinha), em px — preenchimento / divisores. */
  rowSpineGapRects: { id: string; x: number; y: number; w: number; h: number }[];
  /** Dupla costas: eixo ao longo da espinha (costas) entre as duas frentes — tracejado na planta. */
  rowSpineLines: { id: string; x1: number; y1: number; x2: number; y2: number }[];
  /**
   * Travamento superior (montantes &gt; 8 m): traços no corredor entre fileiras — viewBox, px.
   */
  topTravamentoLines: { id: string; x1: number; y1: number; x2: number; y2: number }[];
  structureRects: {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    kind: RackDepthModeV2;
    variant?: ModuleVariantV2;
    /** Meio-módulo (1 baia ao longo do vão) — desenho e legenda distintos na planta. */
    segmentType?: ModuleSegmentType;
    /** Numeração global na planta (1…n), linha a linha, ao longo do vão. */
    displayIndex?: number;
  }[];
  /**
   * Preenchimento extra nos módulos normais: cor da elevação (longarinas / faixas de nível), opacidade 5–10%.
   * Módulos túnel não usam — mantêm cor própria.
   */
  moduleLevelTint: { fill: string; opacity: number };
  circulationRects: {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
    kind: CirculationKind;
    label?: string;
    /** Classificação para hierarquia visual (cor/traço). */
    semantic?: FloorPlanCirculationSemantic;
  }[];
  dimensionLines: FloorPlanDimension[];
  labels: FloorPlanLabel[];
  /**
   * Identificação de cada fileira no próprio desenho (ex.: «Linha 1» no início da faixa ao longo do vão).
   */
  rowLineMarkers?: {
    id: string;
    text: string;
    x: number;
    y: number;
    fontSize: number;
  }[];
  /**
   * Texto extra no módulo túnel quando aplicável (continuidade entre fileiras / uso operacional).
   */
  tunnelOperationHint?: string;
  /**
   * Explicações retiradas do desenho — apenas legenda compacta inferior.
   */
  planLegendNotes?: {
    moduleIndexHint: string;
    firstLevelHint: string;
    implantHint: string;
    strategyHint: string;
    rowLines: string[];
    tunnelNote?: string;
    bayClearSpanNote?: string;
  };
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
  /**
   * `corridor-outside`: linha de cota fora do corredor + extensões (sem sobrepor o rótulo semântico).
   * `corridor-inline`: legado — evitar em novos desenhos.
   */
  textMode?: 'default' | 'corridor-inline' | 'corridor-outside';
  /** Corredor: do vértice da faixa até à linha de cota. */
  extensions?: { x1: number; y1: number; x2: number; y2: number }[];
  /** Posição do texto da cota (centro), quando `corridor-outside`. */
  textAnchor?: { x: number; y: number };
  /** Rotação do texto em graus (ex.: -90 para cota vertical). */
  textRotateDeg?: number;
  /**
   * Hierarquia visual entre cotas (menos competição): envelope do compartimento → corredor → vão de baia.
   */
  dimTier?: 'primary' | 'secondary' | 'detail';
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
  /** Níveis com longarina (entrada do utilizador). */
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
  /**
   * Profundidade representada na **vista lateral**: sempre **uma** costa ({@link LayoutGeometryMetadata.rackDepthMm}),
   * nunca a faixa dupla completa — evita perfil largo com duas baias em profundidade.
   */
  lateralProfileDepthMm: number;
  rackDepthMode: RackDepthModeV2;
  /** Corredor principal (mm) — contexto operacional no PDF. */
  corridorMm: number;
  capacityKgPerLevel: number;
  /**
   * Altura útil de carga por nível (mm), quando conhecida — documentação ALT. MÁX. CARGA.
   * Ausente: deriva-se de `meanGapMm` / geometria de eixos.
   */
  loadHeightMm?: number;
  tunnel: boolean;
  /** Espessura representativa dos montantes (mm) — alinhada ao módulo de referência. */
  uprightThicknessMm?: number;
  /** Pé livre do módulo túnel (mm) — desenho do vão inferior. */
  tunnelClearanceMm?: number;
  firstLevelOnGround: boolean;
  /** Patamar de carga ao nível do piso (sem longarina nesse patamar). */
  hasGroundLevel: boolean;
  /**
   * Patamares de armazenagem no desenho (= structuralLevels + 1 quando há piso).
   * Usado para cotas de carga e faixas visuais.
   */
  totalStorageTiers: number;
  clearHeightMm?: number;
  /** Cotas dos eixos das longarinas (mm, do piso), length = structuralLevels + 1 — de {@link computeBeamElevations}. */
  beamElevationsMm: number[];
  structuralBottomMm: number;
  structuralTopMm: number;
  usableHeightMm: number;
  meanGapMm: number;
  /** Protetor de coluna na base dos montantes (face frontal). */
  columnProtector?: boolean;
  guardRailSimple?: boolean;
  guardRailSimplePosition?: GuardRailPositionCode;
  guardRailDouble?: boolean;
  guardRailDoublePosition?: GuardRailPositionCode;
  /**
   * Travamento de fundo na costa (só quando o layout é só fileiras simples):
   * indicador para a vista lateral — peça 400×50%H atrás do módulo.
   */
  fundoTravamento?: boolean;
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
  kind: 'upright' | 'beam' | 'floor' | 'module_outline';
  x1: number;
  y1: number;
  z1: number;
  x2: number;
  y2: number;
  z2: number;
  /**
   * `warehouse_slab` — perímetro do piso do galpão (excluído do zoom).
   * `module_footprint` — contorno Z=0 de cada prisma.
   * `spine_divider` — arestas verticais do vão da espinha (dupla costas), para não colapsar visualmente as duas pegadas.
   * `bay_divider` — montante e longarina interiores entre as 2 baias (módulo completo; omitido em meio-módulo).
   * `module_outline_half` — contorno Z=0 de segmento meio-módulo (1 baia), traço distinto no 3D.
   */
  lineRole?:
    | 'warehouse_slab'
    | 'module_footprint'
    | 'module_outline_half'
    | 'spine_divider'
    | 'bay_divider';
  /** Só preenchido em modo debug — evita dedupe para colorir por módulo. */
  debugTint?: 'tunnel' | 'normal' | 'boundary';
};

/**
 * Contagens derivadas do mesmo passe que gera o wireframe — para validar contra
 * {@link LayoutGeometry} / planta (sem representação “ilustrativa” silenciosa).
 */
export type Rack3DModelAudit = {
  /** Fileiras processadas (= nº de fileiras na geometria). */
  rowCount: number;
  /** Retângulos de módulo no layout (antes do split 3D). */
  layoutModuleSegmentCount: number;
  tunnelModuleSegmentCount: number;
  halfModuleSegmentCount: number;
  /**
   * Em dupla costas, módulo normal deve gerar ≥ 2 prismas; >0 aqui indica colapso indevido.
   */
  backToBackCollapsedCount: number;
  /** Arestas `module_outline` em Z=0 (esperado: 4 × footprintPrismCount). */
  moduleOutlineLineCount: number;
  /**
   * Segmentos de piso a Z>0 sem `lineRole` (abertura do túnel); esperado alinhar com módulos túnel com pé livre.
   */
  tunnelOpeningFloorSegmentCount: number;
  /**
   * Segmentos verticais `lineRole: spine_divider` (4 por módulo dupla costas com split válido).
   * Confirma que a espinha foi desenhada em altura, não só no piso.
   */
  spineDividerSegmentCount: number;
  /** Segmentos `lineRole: bay_divider` tipo beam (longarina ao longo da profundidade em cada nível). */
  bayDividerBeamSegmentCount: number;
  /** Segmentos `lineRole: bay_divider` tipo upright (2 por prisma: frente e fundo da costa). */
  bayDividerUprightSegmentCount: number;
};

/** Geometria wireframe derivada de {@link LayoutSolutionV2} (sem motor 3D). */
export type Rack3DModel = {
  warehouse: { lengthMm: number; widthMm: number };
  uprightHeightMm: number;
  levels: number;
  lines: Rack3DLine3D[];
  /** Módulos-equivalente representados (meio módulo = 0,5). */
  moduleEquivEmitted: number;
  /** Prismas de pega em planta (1 por costa em dupla costas após split). */
  footprintPrismCount: number;
  audit: Rack3DModelAudit;
};

export type ProjectedLine2D = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: 'upright' | 'beam' | 'floor' | 'module_outline';
  lineRole?:
    | 'warehouse_slab'
    | 'module_footprint'
    | 'module_outline_half'
    | 'spine_divider'
    | 'bay_divider';
  debugTint?: 'tunnel' | 'normal' | 'boundary';
};

/** Após projeção isométrica (unidades arbitrárias até encaixe no viewBox). */
export type Projected2D = {
  lines: ProjectedLine2D[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
};

/** Fragmento `<g>...</g>` ou documento SVG completo, conforme função. */
export type SvgGroup = string;
