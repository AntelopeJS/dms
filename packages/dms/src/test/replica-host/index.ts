import { setTimeout } from "node:timers/promises";
import { Hook, RegisterHook } from "@antelopejs/interface-dms/hooks";

const HOLD_MS = Number(process.env.REPLICA_HOST_HOLD_MS);

/**
 * Stands in for a slow first provisioning in a replica process: it announces
 * itself on stdout, for the test that spawned the process to read.
 */
export function construct(): void {
  RegisterHook(Hook.TENANT_BEING_PROVISIONED, async ({ tenantId }) => {
    process.stdout.write(`replica-host provisioning ${tenantId}\n`);
    await setTimeout(HOLD_MS);
    process.stdout.write(`replica-host provisioned ${tenantId}\n`);
    return undefined;
  });
}
