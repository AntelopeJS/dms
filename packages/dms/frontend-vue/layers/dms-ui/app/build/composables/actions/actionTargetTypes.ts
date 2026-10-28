import type { ActionTarget } from "../../../composables/table-view/types/action-target";
import type { BulkSelection } from "./bulkSelection";

export interface TargetRunExtras {
  selection?: BulkSelection;
  deepLink?: boolean;
  textParams?: Data;
  keepsRow?: boolean;
}

export type SidePanelTarget = ActionTarget & { type: "sidePanel" };
export type RowTarget = SidePanelTarget | (ActionTarget & { type: "drawer" });

export interface SidePanelTargetRun extends TargetRunExtras {
  target: SidePanelTarget;
  title: string;
  containerId: string;
  rowData?: Data;
  missingId?: string;
}

export interface ComponentTargetRun extends TargetRunExtras {
  target: ActionTarget & { type: "modal" | "drawer" };
  title: string;
  description: string;
  containerId: string;
  rowData?: Data;
  missingId?: string;
}

export type TargetsByKind = {
  [Kind in ActionTarget["type"]]: Extract<ActionTarget, { type: Kind }>;
};
export type TargetHandler<Kind extends ActionTarget["type"]> = (
  target: TargetsByKind[Kind],
  label: string,
  rowData?: Data,
  extras?: TargetRunExtras,
) => Promise<void> | void;

export type TargetHandlers = {
  [Kind in ActionTarget["type"]]: TargetHandler<Kind>;
};
