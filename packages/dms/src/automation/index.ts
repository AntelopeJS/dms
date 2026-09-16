import { ACTIONS } from "./actions";
import { AutomationRegistrationLifecycle } from "./registration-lifecycle";
import {
  connectAutomationEventSources,
  disconnectAutomationEventSources,
} from "./sources";
import { TRIGGERS } from "./triggers";

export * from "./events";

const AUTOMATION_INTERFACE_PACKAGE = "@antelopejs/interface-dms-automation";

type AutomationInterface =
  typeof import("@antelopejs/interface-dms-automation");

interface ModuleLoadError extends Error {
  code?: string;
}

let automationInterfacePromise: Promise<AutomationInterface | undefined>;
const automationLifecycle = new AutomationRegistrationLifecycle();

function isMissingAutomationInterface(error: unknown): boolean {
  const moduleError = error as ModuleLoadError;
  const firstLine = moduleError?.message?.split("\n", 1)[0] ?? "";
  return (
    ["MODULE_NOT_FOUND", "ERR_MODULE_NOT_FOUND"].includes(
      moduleError?.code ?? "",
    ) &&
    (firstLine === `Cannot find module '${AUTOMATION_INTERFACE_PACKAGE}'` ||
      firstLine.startsWith(
        `Cannot find package '${AUTOMATION_INTERFACE_PACKAGE}' imported from `,
      ))
  );
}

async function loadAutomationInterface(): Promise<
  AutomationInterface | undefined
> {
  try {
    return await import(AUTOMATION_INTERFACE_PACKAGE);
  } catch (error) {
    if (isMissingAutomationInterface(error)) return undefined;
    throw error;
  }
}

function getAutomationInterface(): Promise<AutomationInterface | undefined> {
  automationInterfacePromise ??= loadAutomationInterface();
  return automationInterfacePromise;
}

/**
 * Declares the DMS automation node types when the optional automation
 * interface package is installed.
 */
export async function registerAutomationNodes(): Promise<void> {
  const automationInterface = await getAutomationInterface();
  if (!automationInterface || !automationLifecycle.beginRegistration()) return;

  try {
    connectAutomationEventSources();
    for (const trigger of TRIGGERS) {
      automationInterface.RegisterTriggerType(trigger);
    }
    for (const action of ACTIONS) {
      automationInterface.RegisterActionType(action);
    }
  } catch (error) {
    automationLifecycle.cleanup(() =>
      cleanupAutomationNodes(automationInterface),
    );
    throw error;
  }
}

export async function unregisterAutomationNodes(): Promise<void> {
  const automationInterface = await getAutomationInterface();
  if (!automationInterface || !automationLifecycle.isCleanupPending) return;

  const errors = automationLifecycle.cleanup(() =>
    cleanupAutomationNodes(automationInterface),
  );
  if (errors.length > 0) {
    throw new AggregateError(
      errors,
      "Failed to unregister DMS automation nodes",
    );
  }
}

function cleanupAutomationNodes(
  automationInterface: AutomationInterface,
): unknown[] {
  const errors: unknown[] = [];
  for (const trigger of TRIGGERS) {
    try {
      automationInterface.UnregisterTriggerType(trigger.id);
    } catch (error) {
      errors.push(error);
    }
  }
  for (const action of ACTIONS) {
    try {
      automationInterface.UnregisterActionType(action.id);
    } catch (error) {
      errors.push(error);
    }
  }
  try {
    disconnectAutomationEventSources();
  } catch (error) {
    errors.push(error);
  }
  return errors;
}
