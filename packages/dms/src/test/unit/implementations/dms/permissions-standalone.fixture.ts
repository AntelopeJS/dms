import { ImplementInterface } from "@antelopejs/interface-core";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import * as permissionsImpl from "../../../../implementations/dms/permissions";

const CONSUMER = "consumer";

ImplementInterface(permissionsInterface, permissionsImpl);
permissionsInterface.RegisterPermission(CONSUMER, {
  id: CONSUMER,
  title: CONSUMER,
});
process.stdout.write(
  JSON.stringify(Object.keys(permissionsImpl.GetPermissions())),
);
