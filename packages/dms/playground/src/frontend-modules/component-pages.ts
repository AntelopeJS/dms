import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { Banner, Card, StatGroup } from "@antelopejs/interface-dms/base";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form";
import { KeyValueList } from "@antelopejs/interface-dms/base/key-value-list";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { READS_URL } from "./api";
import { customComponentsCategory } from "./category";

const SOURCE_MAX_LINES = 40;

@RegisterPage()
export class PageCustomSlots extends PageController(
  "custom-slots",
  {
    displayName: "Slots & injected props",
    description:
      "A module's Vue component receives the children the backend declares with .child(), each in its slot, and the props the DMS injects (pageId, componentId, childCount, routeParams)",
    icon: "i-ph-brackets-curly",
    category: customComponentsCategory,
    order: 0,
  },
  DefaultLayout({}),
) {
  static frame = CustomComponent("SlotFrame")
    .options({ title: "Top-level custom component" })
    .child(
      "notice",
      Banner({
        tone: "info",
        size: "sm",
        title: "In the default slot",
        description:
          "Declared with .child('notice', Banner(...)), no slot named",
      }),
    )
    .child(
      "facts",
      KeyValueList({
        card: false,
        items: [
          { label: "Slot", value: "aside", type: "mono" },
          {
            label: "Declared with",
            value: ".child(id, block, { slot })",
            type: "mono",
          },
        ],
      }),
      { slot: "aside" },
    );

  static nested = Card({ title: "A Card holding a custom component" }).child(
    "frame",
    CustomComponent("SlotFrame")
      .options({ title: "Nested custom component" })
      .child(
        "body",
        Banner({
          tone: "success",
          size: "sm",
          title: "Its componentId is the parent's id, -child-, then its key",
        }),
      ),
  );

  static source = CustomComponent("SourceSnippet").options({
    path: "components/custom/SlotFrame.vue",
    maxLines: SOURCE_MAX_LINES,
  });
}

@RegisterPage()
export class PageCustomBlockWiring extends PageController(
  "custom-block-wiring",
  {
    displayName: "Block-to-block wiring",
    description:
      "A custom block reaches the form beside it (siblingComponentId), names the page's record in the breadcrumb (usePageRecordLabel), scrolls to a block (scrollToBlock) and re-reads every block (refreshPageBlocks). Type a title, then use the buttons",
    icon: "i-ph-flow-arrow",
    category: customComponentsCategory,
    order: 10,
  },
  DefaultLayout({}),
) {
  static wiring = CustomComponent("BlockWiringPanel");

  static reads = StatGroup({
    layout: "cards",
    columns: 3,
    fetchUrl: READS_URL,
  });

  static form = Form({
    title: "Record",
    description:
      "The panel above follows this form through its FIELD_CHANGE events",
    fields: [
      {
        id: "title",
        label: "Title",
        description: "Becomes the last crumb of the breadcrumb",
        type: new DefaultDataTypes.StringType({
          placeholder: "Quarterly report",
        }),
      },
      {
        id: "owner",
        label: "Owner",
        type: new DefaultDataTypes.StringType({ placeholder: "Ada Lovelace" }),
      },
    ],
  });

  static source = CustomComponent("SourceSnippet").options({
    path: "components/custom/BlockWiringPanel.vue",
    maxLines: SOURCE_MAX_LINES,
  });
}

@RegisterPage()
export class PageCustomToolkit extends PageController(
  "custom-toolkit",
  {
    displayName: "Module toolkit",
    description:
      "The composables a module's component calls for its data and its forms: useAuthFetch, useApiErrorPresenter, usePermissions with DmsPermissionGate, useFormDirty with useUnsavedChanges, useComposedText and DmsCodeSnippet",
    icon: "i-ph-toolbox",
    category: customComponentsCategory,
    order: 20,
  },
  DefaultLayout({}),
) {
  static toolkit = CustomComponent("ModuleToolkit");
}
