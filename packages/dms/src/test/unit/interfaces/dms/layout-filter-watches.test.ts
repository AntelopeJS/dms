import { ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import { ComponentBuilder } from "@antelopejs/interface-dms/component";
import { withPermissionAncestors } from "@antelopejs/interface-dms/internal/permission-ids";
import {
  type ComponentNodeMap,
  filterComponents,
} from "@antelopejs/interface-dms/page/layout-filter";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";

const CONTEXT = { tenantId: "tenant", user: undefined };

const CATEGORY = "lfw-watches";
const PAGE = `${CATEGORY}.page`;
const HOST = `${PAGE}.host`;
const HELD = `${PAGE}.held`;
const DENIED = `${PAGE}.denied`;

const REGISTERED = [
  { id: CATEGORY, title: "Watches" },
  { id: PAGE, title: "Page" },
  { id: HOST, title: "Host" },
  { id: HELD, title: "Held" },
  { id: DENIED, title: "Denied" },
];

const OPEN = { functionId: "open" };
const GRANTED = { functionId: "granted", requirePermission: HELD };
const WITHHELD = { functionId: "withheld", requirePermission: DENIED };

interface ServedHost {
  drawer: { content: { options: { watchActions: { functionId: string }[] } } };
}

const isServedHost = (value: unknown): value is ServedHost =>
  value instanceof Object &&
  "drawer" in value &&
  value.drawer instanceof Object &&
  "content" in value.drawer &&
  value.drawer.content instanceof Object &&
  "options" in value.drawer.content &&
  value.drawer.content.options instanceof Object &&
  "watchActions" in value.drawer.content.options &&
  Array.isArray(value.drawer.content.options.watchActions);

/** The ids of the watches a host embeds that the caller is served, in order. */
async function servedWatchIds(
  embedded: unknown[],
  permissions: Set<string>,
): Promise<string[]> {
  const host = new ComponentBuilder<{ drawer: { content: unknown } }>(
    "WatchesDrawerHost",
  ).options({ drawer: { content: { options: { watchActions: embedded } } } });
  const hostMap: ComponentNodeMap = new Map([
    [HOST, { component: host, permissionId: HOST, depth: 0, access: "own" }],
  ]);
  const served = await filterComponents(
    { host: await host.serialize() },
    PAGE,
    permissions,
    hostMap,
    CONTEXT,
  );
  const options = served.host?.options;
  if (!isServedHost(options)) {
    throw new Error("The served host carries no embedded watches");
  }
  return options.drawer.content.options.watchActions.map(
    (watch) => watch.functionId,
  );
}

describe("[unit] interfaces/dms/page — the watches embedded in a component's options", () => {
  before(() => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    for (const permission of REGISTERED) {
      permissionsInterface.RegisterPermission(permission.id, permission);
    }
  });

  after(() => {
    for (const { id } of REGISTERED) {
      permissionsInterface.UnregisterPermission(id);
    }
  });

  it("serves the open watch and the granted one, and withholds the one the caller lacks", async () => {
    expect(
      await servedWatchIds(
        [OPEN, GRANTED, WITHHELD],
        new Set(withPermissionAncestors([HOST, HELD])),
      ),
    ).to.deep.equal(["open", "granted"]);
  });

  it("withholds a watch it cannot read instead of failing the page, whatever the caller holds", async () => {
    expect(
      await servedWatchIds(
        [null, OPEN, { functionId: "odd", requirePermission: 5 }, GRANTED],
        new Set(withPermissionAncestors([HOST, HELD])),
      ),
    ).to.deep.equal(["open", "granted"]);
    expect(
      await servedWatchIds(
        [null, OPEN, { requirePermission: 5 }],
        new Set(["*"]),
      ),
    ).to.deep.equal(["open"]);
  });
});
