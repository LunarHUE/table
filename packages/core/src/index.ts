// The framework-free core: reactive cells, keyed stores for rows, columns
// and cells, diagnostics, and the bindings that let apps own state slices.

/** The package's name, as published. */
export const coreName = "@lunarhue/table-core";

export {
  cellKey,
  createCell,
  createCells,
  createKeyedCells,
  type Cell,
  type Cells,
  type KeyedScope,
  type KeyedStore,
} from "./cells.js";
export { problem, type Code } from "./problem.js";
export {
  createSliceCoordinator,
  type ControlledGroupBinding,
  type ControlledSliceBinding,
  type CoordinatorOptions,
  type ExternalGroupBinding,
  type ExternalSliceBinding,
  type GroupBinding,
  type SliceBinding,
  type SliceBindings,
  type SlicePatch,
  type StateCoordinator,
  type StateUpdater,
} from "./bindings.js";
