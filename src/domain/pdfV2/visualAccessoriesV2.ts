import type {
  ElevationPanelPayload,
  FloorPlanAccessoriesV2,
  GuardRailPositionCode,
} from './types';
import type { LayoutGeometry } from './layoutGeometryV2';

export function parseGuardPosition(
  v: unknown
): GuardRailPositionCode | undefined {
  if (v === 'INICIO' || v === 'FINAL' || v === 'AMBOS') return v;
  return undefined;
}

/** Com guarda ativa mas sem posição nas respostas, assume-se toda a extensão do vão (mesma leitura que o resumo “Sim”). */
function guardPositionOrDefault(
  enabled: boolean,
  pos: GuardRailPositionCode | undefined
): GuardRailPositionCode | undefined {
  if (!enabled) return undefined;
  return pos ?? 'AMBOS';
}

/** Campos visuais comuns à elevação e à planta (protetor de coluna, guardas, 1.º nível). */
export function accessoryFieldsFromAnswers(
  answers: Record<string, unknown>
): Pick<
  ElevationPanelPayload,
  | 'columnProtector'
  | 'guardRailSimple'
  | 'guardRailSimplePosition'
  | 'guardRailDouble'
  | 'guardRailDoublePosition'
> {
  const simpleOn = answers.guardRailSimple === true;
  const doubleOn = answers.guardRailDouble === true;
  return {
    columnProtector: answers.columnProtector === true,
    guardRailSimple: simpleOn,
    guardRailSimplePosition: guardPositionOrDefault(
      simpleOn,
      parseGuardPosition(answers.guardRailSimplePosition)
    ),
    guardRailDouble: doubleOn,
    guardRailDoublePosition: guardPositionOrDefault(
      doubleOn,
      parseGuardPosition(answers.guardRailDoublePosition)
    ),
  };
}

export function buildFloorPlanAccessories(
  answers: Record<string, unknown> | undefined,
  geometry: LayoutGeometry
): FloorPlanAccessoriesV2 {
  const a = answers ?? {};
  const simpleOn = a.guardRailSimple === true;
  const doubleOn = a.guardRailDouble === true;
  return {
    columnProtector: a.columnProtector === true,
    guardRailSimple: simpleOn,
    guardRailSimplePosition: guardPositionOrDefault(
      simpleOn,
      parseGuardPosition(a.guardRailSimplePosition)
    ),
    guardRailDouble: doubleOn,
    guardRailDoublePosition: guardPositionOrDefault(
      doubleOn,
      parseGuardPosition(a.guardRailDoublePosition)
    ),
    firstLevelOnGround: geometry.metadata.firstLevelOnGround,
  };
}
