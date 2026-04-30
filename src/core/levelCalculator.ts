/**
 * Fachada estável para cálculo de níveis estruturais e perfil de montante (funções puras).
 * Implementação canónica em {@link ../domain/warehouseHeightDerive}.
 */

export {
  moduleHeightMmFromWarehouseClearHeightCeiling,
  maxStructuralLevelsForModuleHeight,
  listFeasibleWarehouseRacksForCeiling,
  pickBestWarehouseRackFromCeilingMm,
  deriveModuleFromWarehouseClearHeight,
  deriveRackFromWarehouseHeightMm,
  HEIGHT_DEFINITION_MODULE_TOTAL,
  HEIGHT_DEFINITION_WAREHOUSE_CLEAR,
  HEIGHT_MODE_WAREHOUSE_HEIGHT,
  type HeightDefinitionMode,
  type WarehouseRackPickResult,
  type WarehouseRackPickWithGap,
} from '../domain/warehouseHeightDerive';
