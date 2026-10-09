import { expect } from "chai";
import {
  ActionList,
  type ActionListSerializedOptions,
} from "@antelopejs/interface-dms/base/action-list";
import { GetBlockType } from "@antelopejs/interface-dms/base/block-types";
import { ComponentBuilder } from "@antelopejs/interface-dms/component";
import type { RecordAction } from "@antelopejs/interface-dms/base/types/record-action";

const CONTEXT = { tenantId: "tenant", user: undefined };
const PERMISSION_ID = "pages.workspaces.detail.operator";
const API = "/api/workspaces/{{params.id}}";

const CREDIT_FORM = new ComponentBuilder("dms-form").options({
  submitUrl: `${API}/credit`,
});

// The operator card of a workspace detail page.
const OPERATOR_ACTIONS: RecordAction[] = [
  {
    id: "credit",
    label: "$operator.credit",
    description: "$operator.credit_description",
    icon: "i-ph-coins",
    unavailableWhen: {
      field: "stripeCustomerId",
      truthy: false,
      reason: "$operator.no_customer",
    },
    target: { type: "modal", component: CREDIT_FORM },
  },
  {
    id: "join",
    label: "$operator.join",
    when: { field: "joinedAt", truthy: false },
    permission: "join",
    target: { type: "api", url: `${API}/join`, successMessage: "$joined" },
  },
  {
    id: "suspend",
    label: "$operator.suspend",
    color: "error",
    availability: ({ tenantId }) =>
      tenantId === "tenant" ? { reason: "$operator.own_tenant" } : undefined,
    target: { type: "api", url: `${API}/suspend`, successMessage: "$done" },
    confirm: { from: `${API}/suspend/impact` },
  },
];

function served(list: ComponentBuilder<ActionListSerializedOptions>) {
  return list.serializeSync().options!;
}

async function filtered(
  list: ComponentBuilder<ActionListSerializedOptions>,
  permissions: string[],
) {
  return (await list.onFilterCallback!(
    new Set(permissions),
    served(list),
    PERMISSION_ID,
    CONTEXT,
  )) as ActionListSerializedOptions;
}

describe("[unit] interfaces/dms-base/action-list", () => {
  it("is a block of the catalog, in a card by default", () => {
    const block = GetBlockType("ActionList");
    expect(block?.componentName).to.equal("dms-action-list-block");
    expect(block?.defaults.card).to.equal(true);
    expect(block?.config).to.include.keys("actions", "fetchUrl", "empty");
    expect(served(ActionList()).card).to.equal(true);
  });

  it("serves each action as a header button is, its conditions as written", () => {
    const options = served(
      ActionList({
        title: "$operator.title",
        fetchUrl: `${API}/operator`,
        actions: OPERATOR_ACTIONS,
      }),
    );
    expect(options.title).to.equal("$operator.title");
    expect(options.fetchUrl).to.equal(`${API}/operator`);

    const [credit, join, suspend] = options.actions!;
    expect(credit).to.deep.include({
      id: "credit",
      description: "$operator.credit_description",
      unavailableWhen: OPERATOR_ACTIONS[0]!.unavailableWhen,
    });
    expect(credit?.target).to.deep.include({
      type: "modal",
      component: CREDIT_FORM.serializeSync(),
    });
    expect(join).to.deep.include({
      when: { field: "joinedAt", truthy: false },
    });
    expect(join).to.not.have.property("permission");
    expect(suspend).to.deep.include({
      color: "error",
      confirm: { from: `${API}/suspend/impact` },
    });
    expect(suspend).to.not.have.property("availability");
  });

  it("names its actions as buttons, so a role grants them", () => {
    const list = ActionList({ actions: OPERATOR_ACTIONS });
    expect(list.getButton("join")).to.deep.include({ permission: "join" });
    expect(list.getButton("credit")).to.not.equal(undefined);
  });

  it("leaves out an action the caller lacks the permission for", async () => {
    const list = ActionList({ actions: OPERATOR_ACTIONS });
    const refused = await filtered(list, []);
    expect(refused.actions?.map((action) => action.id)).to.deep.equal([
      "credit",
      "suspend",
    ]);
    const granted = await filtered(list, [`${PERMISSION_ID}.join`]);
    expect(granted.actions?.map((action) => action.id)).to.deep.equal([
      "credit",
      "join",
      "suspend",
    ]);
  });

  it("disables an action its server-side availability refuses", async () => {
    const options = await filtered(
      ActionList({ actions: OPERATOR_ACTIONS }),
      [],
    );
    expect(options.actions?.at(-1)).to.deep.include({
      disabled: true,
      disabledReason: "$operator.own_tenant",
    });
  });
});
