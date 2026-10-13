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
      "DmsIconWell, DmsStatusPill, DmsEyebrow, DmsSectionHeader, DmsCopyButton and DmsAutoLink in every tone, size and variant. Click a copy button to try it",
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
      "DmsBanner, DmsEmptyState, DmsMeter, DmsCheckList, DmsPasswordRules and DmsStatusSummary, plus the internal permission veil for review. Type a password to watch the rules tick",
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
      "DmsListRow, DmsActivityItem, DmsKeyValueList, DmsStatGroup and DmsMasterDetail with their variants. Pick an entry of the master-detail to open its detail",
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
      "DmsCard, DmsNavCard, DmsRecordCard, DmsSegmented, DmsSection and the settings rows (DmsFieldRow, DmsSaveStatus, DmsInstantSaveBadge, DmsSaveBar). Edit a settings field to bring up the save bar",
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
