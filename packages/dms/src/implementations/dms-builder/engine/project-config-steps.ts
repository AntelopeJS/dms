import type { ProjectConfigStep } from "@antelopejs/interface-dms-builder";
import {
  addModule,
  type ConfigDraft,
  createLocalModule,
  refuse,
  writeEntry,
} from "./project-config";
import { removeConnection, removeModule } from "./project-config-remove";

/** Applies one step to the draft, or throws a `StepRefusal` saying why it cannot. */
export function applyStep(draft: ConfigDraft, step: ProjectConfigStep): void {
  switch (step.op) {
    case "AddModule":
      addModule(draft, step.id, step.entry);
      return;
    case "ConfigureModule":
      writeEntry(draft, step.id, step.entry);
      return;
    case "CreateLocalModule":
      createLocalModule(draft, step);
      return;
    case "RemoveModule":
      removeModule(draft, step);
      return;
    case "RemoveConnection":
      removeConnection(draft, step);
      return;
    default: {
      const unknownStep: { op?: string } = step;
      refuse(`unknown step "${String(unknownStep.op)}"`);
    }
  }
}
