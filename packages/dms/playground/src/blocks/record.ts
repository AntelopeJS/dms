import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { ActionList, KeyValueList } from "@antelopejs/interface-dms/base";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import type { RecordAction } from "@antelopejs/interface-dms/base/types/record-action";
import { blocksCategory } from "./category";

const API = "/api/blocks/record";

const apiTarget = (operation: string, successMessage: string) => ({
  type: "api" as const,
  url: `${API}/${operation}`,
  successMessage,
});

// The header's buttons: a primary action by billing state, the rest in the
// "More actions" menu, suspend and reactivate swapping with the status.
const HEADER_ACTIONS: RecordAction[] = [
  {
    id: "subscribe",
    label: "Start a subscription",
    icon: "i-ph-credit-card",
    color: "primary",
    when: { field: "billed", truthy: false },
    target: apiTarget("subscribe", "Subscribed"),
  },
  {
    id: "grant-credit",
    label: "Grant €10 credit",
    icon: "i-ph-coins",
    menuGroup: "support",
    unavailableWhen: {
      field: "stripeCustomerId",
      truthy: false,
      reason: "Needs a Stripe customer: start a subscription first",
    },
    target: apiTarget("credit", "Credit granted"),
  },
  {
    id: "reset",
    label: "Reset the demo",
    icon: "i-ph-arrow-counter-clockwise",
    menuGroup: "support",
    target: apiTarget("reset", "Demo reset"),
  },
  {
    id: "suspend",
    label: "Suspend…",
    icon: "i-ph-prohibit",
    color: "error",
    menuGroup: "danger",
    when: { not: { field: "status", equals: "suspended" } },
    target: apiTarget("suspend", "Suspended"),
    confirm: { from: `${API}/suspend/impact` },
  },
  {
    id: "reactivate",
    label: "Reactivate",
    icon: "i-ph-play-circle",
    menuGroup: "danger",
    when: { field: "status", equals: "suspended" },
    target: apiTarget("reactivate", "Reactivated"),
    confirm: { title: "Reactivate {name}?", color: "primary" },
  },
];

// The operator card: the same actions, listed with what they do and why
// they are unavailable.
const OPERATOR_ACTIONS: RecordAction[] = [
  {
    id: "operator-credit",
    label: "Grant €10 credit",
    description: "Added to the next Stripe invoice",
    icon: "i-ph-coins",
    unavailableWhen: {
      field: "stripeCustomerId",
      truthy: false,
      reason: "Needs a Stripe customer: start a subscription first",
    },
    target: apiTarget("credit", "Credit granted"),
  },
  {
    id: "operator-join",
    label: "Join as support",
    description: "Opens the workspace as one of its members",
    icon: "i-ph-user-plus",
    unavailableWhen: {
      field: "joinedAt",
      truthy: true,
      reason: "Already joined",
    },
    target: apiTarget("join", "Joined"),
  },
  {
    id: "operator-suspend",
    label: "Suspend the workspace",
    description: "Signs every member out until it is reactivated",
    icon: "i-ph-prohibit",
    color: "error",
    when: { not: { field: "status", equals: "suspended" } },
    target: apiTarget("suspend", "Suspended"),
    confirm: { from: `${API}/suspend/impact` },
  },
];

@RegisterPage()
export class PageBlocksRecord extends PageController(
  "blocks-record",
  {
    displayName: "Record header & actions",
    icon: "i-ph-identification-badge",
    category: blocksCategory,
    order: 60,
    description:
      "A detail page driven by its record: header, menu and ActionList follow its state",
  },
  DefaultLayout({
    header: { fetchUrl: `${API}/header` },
    headerActions: HEADER_ACTIONS,
  }),
) {
  static facts = KeyValueList({
    title: "Facts",
    fetchUrl: `${API}/facts`,
    columns: 2,
    skeletonCount: 4,
  });

  // No `fetchUrl`: the list reads the record the header loaded.
  static operator = ActionList({
    title: "Operator actions",
    actions: OPERATOR_ACTIONS,
  });
}
