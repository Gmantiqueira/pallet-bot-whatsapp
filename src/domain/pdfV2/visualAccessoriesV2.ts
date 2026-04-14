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

/** Campos visuais comuns à elevação e à planta (protetores, guardas, 1.º nível). */
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
  return {
    columnProtector: answers.columnProtector === true,
    guardRailSimple: answers.guardRailSimple === true,
    guardRailSimplePosition: parseGuardPosition(
      answers.guardRailSimplePosition
    ),
    guardRailDouble: answers.guardRailDouble === true,
    guardRailDoublePosition: parseGuardPosition(
      answers.guardRailDoublePosition
    ),
  };
}

export function buildFloorPlanAccessories(
  answers: Record<string, unknown> | undefined,
  geometry: LayoutGeometry
): FloorPlanAccessoriesV2 {
  const a = answers ?? {};
  return {
    columnProtector: a.columnProtector === true,
    guardRailSimple: a.guardRailSimple === true,
    guardRailSimplePosition: parseGuardPosition(a.guardRailSimplePosition),
    guardRailDouble: a.guardRailDouble === true,
    guardRailDoublePosition: parseGuardPosition(a.guardRailDoublePosition),
    firstLevelOnGround: geometry.metadata.firstLevelOnGround,
  };
}
