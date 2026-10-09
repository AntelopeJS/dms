/**
 * Side-effect barrel registering every built-in block type.
 *
 * Importing it populates the block registry without pulling in the parts of
 * `dms-base` that need a running DMS (database models, export jobs), so builder
 * tooling can read the catalog on its own.
 *
 * Both surfaces are re-exported: reading a block type and declaring one. A
 * module registering its own block reaches `RegisterBlockType` through here, so
 * the helpers its schema needs — `ui`, `narrowString`, `opaqueOption` — have to
 * be reachable from the same place.
 */
import "./action-list";
import "./activity-feed";
import "./banner";
import "./card";
import "./internal/chart-schemas";
import "./chart-card";
import "./empty-state";
import "./form-block-schema";
import "./grid";
import "./key-value-list";
import "./kpi-card";
import "./meter";
import "./nav-card-grid";
import "./period-selector";
import "./placeholder";
import "./resource-form-schema";
import "./section";
import "./stack";
import "./stat-group";
import "./tab";
import "./table-view/schema";
import "./top-list-card";

// Declared data sources travel with the block types: a builder reading the
// catalog needs both to know what a block may be pointed at.
export * from "./data-sources";
export * from "./block-registry/helpers";
export * from "./block-registry/registry";
export * from "./block-registry/types";
