import {
  GetInterfaceInstances,
  GetResponsibleModule,
  type InterfaceConnection,
  RunWithResponsibleModule,
} from "@antelopejs/interface-core";

/**
 * The module this file belongs to, read while the module evaluates it. A route handler runs in
 * the context of the module serving HTTP, so a lookup made there would answer that module's
 * connections, not this one's.
 */
const OWN_MODULE = GetResponsibleModule();

/** The id `antelope.config.ts` gives this module when the core does not report one. */
const DEFAULT_MODULE_ID = "dms";

/** The id `antelope.config.ts` gives this module: its catalog connections are declared on that entry. */
export function ownModuleId(): string {
  return OWN_MODULE ?? DEFAULT_MODULE_ID;
}

/** The connections core wires from the module `moduleId` to the providers of an interface. */
export function moduleConnections(
  moduleId: string,
  interfaceId: string,
): InterfaceConnection[] {
  return RunWithResponsibleModule(moduleId, () =>
    GetInterfaceInstances(interfaceId),
  );
}

/** The builder's own connections to an interface it declares. */
export function ownConnections(interfaceId: string): InterfaceConnection[] {
  const lookup = () => GetInterfaceInstances(interfaceId);
  return OWN_MODULE === undefined
    ? lookup()
    : RunWithResponsibleModule(OWN_MODULE, lookup);
}
