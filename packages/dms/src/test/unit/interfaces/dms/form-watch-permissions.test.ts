import { ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import {
  Form,
  FormEvents,
  FormFunctions,
} from "@antelopejs/interface-dms/base/form";
import type { WatchAction } from "@antelopejs/interface-dms/base/types/watch";
import { ComponentBuilder } from "@antelopejs/interface-dms/component";
import { withPermissionAncestors } from "@antelopejs/interface-dms/internal/permission-ids";
import {
  type ComponentNodeMap,
  filterComponents,
} from "@antelopejs/interface-dms/page/layout-filter";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";

const CONTEXT = { tenantId: "tenant", user: undefined };

const CATEGORY = "fwp-forms";
const PAGE = `${CATEGORY}.watch-actions`;
const FORM = `${PAGE}.form`;

const GROUPED_PAGE = `${CATEGORY}.form-grouped`;
const GROUPED_FORM = `${GROUPED_PAGE}.form`;

const REGISTERED = [
  { id: CATEGORY, title: "Forms" },
  { id: PAGE, title: "Watch actions" },
  { id: FORM, title: "Form" },
  { id: GROUPED_PAGE, title: "Grouped form" },
  { id: GROUPED_FORM, title: "Form" },
  { id: `${PAGE}.host`, title: "Host" },
];

const form = Form({
  title: "Demo Form",
  fields: [
    {
      id: "isOwner",
      label: "Is Owner",
      type: new DefaultDataTypes.BooleanType(),
      defaultValue: false,
    },
    {
      id: "displayName",
      label: "Display Name",
      type: new DefaultDataTypes.StringType(),
    },
    {
      id: "adminNotes",
      label: "Admin Notes",
      type: new DefaultDataTypes.StringType({ textarea: true }),
    },
  ],
})
  .watch(FormEvents.FIELD_CHANGE, FormFunctions.SET_FIELD_DISABLED, {
    params: { targetField: "displayName", setDisabled: true },
    onParam: [{ key: "fieldId", value: "isOwner" }],
  })
  .watch(FormEvents.FIELD_CHANGE, FormFunctions.SET_FIELD_DISABLED, {
    requirePermission: GROUPED_FORM,
    params: { targetField: "adminNotes", setDisabled: false },
    onParam: [{ key: "fieldId", value: "isOwner" }],
  });

const componentMap: ComponentNodeMap = new Map([
  [FORM, { component: form, permissionId: FORM, depth: 0, access: "own" }],
]);

const watchTargets = (options: unknown) =>
  ((options as { watchActions?: WatchAction[] }).watchActions ?? []).map(
    (watch) => watch.params?.targetField,
  );

const HOST = `${PAGE}.host`;
const host = new ComponentBuilder<{ drawer: { content: unknown } }>(
  "DemoDrawerHost",
).options({ drawer: { content: form.serializeSync() } });
const hostMap: ComponentNodeMap = new Map([
  [HOST, { component: host, permissionId: HOST, depth: 0, access: "own" }],
]);

/** The fields the watches of the form the host embeds act on, as served. */
async function servedEmbeddedWatchTargets(permissions: Set<string>) {
  const served = await filterComponents(
    { host: await host.serialize() },
    PAGE,
    permissions,
    hostMap,
    CONTEXT,
  );
  const options = served.host!.options as { drawer: { content: unknown } };
  return watchTargets((options.drawer.content as { options: unknown }).options);
}

/** The fields the watches the caller is served act on, in order. */
async function servedWatchTargets(permissions: Set<string>) {
  const served = await filterComponents(
    { form: await form.serialize() },
    PAGE,
    permissions,
    componentMap,
    CONTEXT,
  );
  expect(served, "the form itself was not served").to.have.property("form");
  return watchTargets(served.form!.options);
}

describe("[unit] interfaces/dms/page — a form's watches gated by requirePermission", () => {
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

  it("serves the gated watch to the owner, who bypasses every permission", async () => {
    expect(await servedWatchTargets(new Set(["*"]))).to.deep.equal([
      "displayName",
      "adminNotes",
    ]);
  });

  it("serves it to a member holding the permission with its ancestors", async () => {
    expect(
      await servedWatchTargets(
        new Set(withPermissionAncestors([FORM, GROUPED_FORM])),
      ),
    ).to.deep.equal(["displayName", "adminNotes"]);
  });

  it("withholds it from a member without the permission", async () => {
    expect(
      await servedWatchTargets(new Set(withPermissionAncestors([FORM]))),
    ).to.deep.equal(["displayName"]);
  });

  it("withholds it from a member holding the permission but not its page", async () => {
    expect(
      await servedWatchTargets(new Set([CATEGORY, PAGE, FORM, GROUPED_FORM])),
    ).to.deep.equal(["displayName"]);
  });

  it("filters the watches of a form embedded in another component's options", async () => {
    expect(
      await servedEmbeddedWatchTargets(
        new Set(withPermissionAncestors([HOST])),
      ),
    ).to.deep.equal(["displayName"]);
    expect(
      await servedEmbeddedWatchTargets(
        new Set(withPermissionAncestors([HOST, GROUPED_FORM])),
      ),
    ).to.deep.equal(["displayName", "adminNotes"]);
  });

  it("always serves a watch that requires no permission", async () => {
    for (const permissions of [
      new Set(["*"]),
      new Set(withPermissionAncestors([FORM])),
      new Set([CATEGORY, PAGE, FORM, GROUPED_FORM]),
    ]) {
      expect(await servedWatchTargets(permissions)).to.include("displayName");
    }
  });
});
