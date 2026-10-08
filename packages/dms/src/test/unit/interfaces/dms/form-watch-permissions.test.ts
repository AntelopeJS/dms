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
// What the gated watch requires: the form of another page, as the Watch
// Actions demo requires the grouped form's.
const GROUPED_PAGE = `${CATEGORY}.form-grouped`;
const GROUPED_FORM = `${GROUPED_PAGE}.form`;

const REGISTERED = [
  { id: CATEGORY, title: "Forms" },
  { id: PAGE, title: "Watch actions" },
  { id: FORM, title: "Form" },
  { id: GROUPED_PAGE, title: "Grouped form" },
  { id: GROUPED_FORM, title: "Form" },
];

// The form of the Watch Actions demo: one watch for everyone, one gated by
// `requirePermission`.
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
  const { watchActions = [] } = served.form!.options as {
    watchActions?: WatchAction[];
  };
  return watchActions.map((watch) => watch.params?.targetField);
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
