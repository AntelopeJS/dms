import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { foundationsCategory } from "./category";

@RegisterPage()
export class PageFoundationsLabels extends PageController(
  "foundations-labels",
  {
    displayName: "Icons, pills & labels",
    description:
      "DmsIconWell (every tone × size), DmsStatusPill (tones, dots, sizes, variants, icons), DmsEyebrow, DmsSectionHeader, DmsCopyButton and DmsAutoLink",
    icon: "i-ph-tag",
    category: foundationsCategory,
    order: 0,
  },
  DefaultLayout({}),
) {
  static content = CustomComponent("FoundationsLabels").meta({
    name: "Icons, pills & labels",
    icon: "i-ph-tag",
  });
}

@RegisterPage()
export class PageFoundationsFeedback extends PageController(
  "foundations-feedback",
  {
    displayName: "Feedback & status",
    description:
      "DmsBanner, DmsEmptyState, DmsMeter, DmsCheckList, DmsPasswordRules (with a live input), DmsPermissionVeil and DmsStatusSummary",
    icon: "i-ph-info",
    category: foundationsCategory,
    order: 10,
  },
  DefaultLayout({}),
) {
  static content = CustomComponent("FoundationsFeedback").meta({
    name: "Feedback & status",
    icon: "i-ph-info",
  });
}

@RegisterPage()
export class PageFoundationsLists extends PageController(
  "foundations-lists",
  {
    displayName: "Lists & data",
    description:
      "DmsListRow (unread, current, meta, trailing actions, bare, sizes), DmsActivityItem, DmsKeyValueList and DmsStatStrip",
    icon: "i-ph-list-bullets",
    category: foundationsCategory,
    order: 20,
  },
  DefaultLayout({}),
) {
  static content = CustomComponent("FoundationsLists").meta({
    name: "Lists & data",
    icon: "i-ph-list-bullets",
  });
}

@RegisterPage()
export class PageFoundationsSurfaces extends PageController(
  "foundations-surfaces",
  {
    displayName: "Cards & controls",
    description:
      "DmsCard (title, count, actions, footer, selected), DmsNavCard (state, badge, readout), DmsSegmented and the settings rows: DmsFieldRow, DmsSaveStatus, DmsInstantSaveBadge, DmsSaveBar",
    icon: "i-ph-cards-three",
    category: foundationsCategory,
    order: 30,
  },
  DefaultLayout({}),
) {
  static content = CustomComponent("FoundationsSurfaces").meta({
    name: "Cards & controls",
    icon: "i-ph-cards-three",
  });
}

@RegisterPage()
export class PageFoundationsOverlays extends PageController(
  "foundations-overlays",
  {
    displayName: "Overlays",
    description:
      "DmsConfirmModal opened through useConfirm(): simple, impact list, typed confirmation, async onConfirm with loading and error, custom body, acknowledge-only",
    icon: "i-ph-browsers",
    category: foundationsCategory,
    order: 40,
  },
  DefaultLayout({}),
) {
  static content = CustomComponent("FoundationsOverlays").meta({
    name: "Overlays",
    icon: "i-ph-browsers",
  });
}
