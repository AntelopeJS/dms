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

/** The builder's own connections to an interface it declares. */
export function ownConnections(interfaceId: string): InterfaceConnection[] {
  const lookup = () => GetInterfaceInstances(interfaceId);
  return OWN_MODULE === undefined
    ? lookup()
    : RunWithResponsibleModule(OWN_MODULE, lookup);
}
