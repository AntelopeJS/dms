import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { TableView } from "@antelopejs/interface-dms/base/table-view";
import { tableViewCategory } from "../category";
import { demoGuide } from "../guide";
import { roadmapFeatureDataAPI } from "./data-api";

@RegisterPage()
export class PageTableViewReorder extends PageController(
  "table-view-reorder",
  {
    displayName: "Rows ordered by hand",
    icon: "i-ph-dots-six-vertical",
    category: tableViewCategory,
    order: 105,
    description:
      "A roadmap ordered by hand on the grid and on the built-in cards display. Drag a row by its handle, then switch to the cards and upvote one.",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static guide = demoGuide([
    {
      label: "Drag a row",
      text: 'reorder { field: "position" }: a handle (or the arrow keys on it) moves a row; only the moved rows are saved. Off while a search or a filter narrows the rows.',
    },
    {
      label: "Cards display",
      text: 'displays: [{ id: "table" }, { id: "cards" }] with card.component (FeatureRecordCard, drawn with DmsRecordCard): the card draws the move handle it is handed.',
    },
    {
      label: "Upvote",
      text: 'A custom row action with id "upvote": the card lists the row\'s actions with actions.customFor(row) and runs one with actions.custom(action, row).',
    },
  ]);

  static roadmap = TableView(roadmapFeatureDataAPI, {
    caption: "Roadmap",
    labelKey: "name",
    reorder: { field: "position" },
    formContainer: { type: "drawer" },
    displays: [{ id: "table" }, { id: "cards" }],
    card: { component: CustomComponent("FeatureRecordCard") },
    rowActions: {
      add: true,
      edit: true,
      delete: true,
      hasSelection: true,
      custom: [
        {
          id: "upvote",
          label: "Upvote",
          icon: "i-ph-arrow-fat-up",
          target: {
            type: "api",
            url: "/api/playground/roadmap-features/upvote?id={{row._id}}",
            method: "POST",
            successMessage: "Upvoted",
          },
        },
      ],
    },
  });
}
