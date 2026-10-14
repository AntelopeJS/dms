import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Banner } from "@antelopejs/interface-dms/base";
import { Form } from "@antelopejs/interface-dms/base/form";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import { pageCategory } from "../category";

const AGENT_ITEMS = [
  { label: "Claude Code", value: "claude" },
  { label: "Codex", value: "codex" },
];

const THINKING_ITEMS = [
  { label: "Off", value: "off" },
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
];

const APPROVAL_ITEMS = [
  { label: "Ask first", value: "ask" },
  { label: "Accept edits", value: "edits" },
  { label: "Plan only", value: "plan" },
];

const ALWAYS_ASK_ITEMS = [
  { label: "Deleting pages, tables or fields", value: "delete" },
  { label: "Adding or removing dependencies", value: "dependencies" },
  { label: "Moving Builder blocks", value: "blocks" },
];

const ASSISTANT_GROUP = "Assistant";
const WORKSPACE_GROUP = "Workspace";
const PAGE_PATH = "/form/form-sections";

/**
 * A module's settings as one form split into sections: a side list follows
 * the scroll, titles each run of sections sharing a `navGroup`, marks the
 * sections holding unsaved changes or errors, and the save bar names the
 * changed sections. A top-level field comes first, outside any section.
 */
@RegisterPage()
export class PageFormSections extends PageController(
  "form-sections",
  {
    displayName: "Sections",
    icon: "i-ph-list-dashes",
    category: pageCategory,
    order: 6,
    description:
      "One settings form split into sections, listed on the side under their group headings. Change a value: the list marks its section and the save bar names it.",
  },
  FormPageLayout(),
) {
  static anchors = Banner({
    title: "Anchors",
    description:
      "A field's id or a section's anchor in the URL brings it into view, once the form is loaded.",
    size: "sm",
    actions: [
      { label: "#retentionDays (a field)", to: `${PAGE_PATH}#retentionDays` },
      {
        label: "#dms-form-form-section-usage (a section)",
        to: `${PAGE_PATH}#dms-form-form-section-usage`,
      },
    ],
  });

  static form = Form({
    title: "Assistant settings",
    description:
      "Defaults for new conversations. Change a value in any section: the list marks it, and the save bar names it.",
    fetchUrl: "/api/form-sections/get",
    submitUrl: "/api/form-sections/save",
    sectionNav: "side",
    fields: [
      {
        id: "profileName",
        label: "Profile name",
        description: "A top-level field: it comes before every section.",
        type: new DefaultDataTypes.StringType(),
        required: true,
      },
    ],
    sections: [
      {
        id: "agent",
        navGroup: ASSISTANT_GROUP,
        label: "Agent",
        icon: "i-ph-robot",
        description: "Which agent answers, and how long it thinks.",
        fields: [
          {
            id: "agent",
            label: "Coding agent",
            description: "Runs on this machine, in the project folder.",
            type: new DefaultDataTypes.SelectType({ items: AGENT_ITEMS }),
            required: true,
          },
          {
            id: "thinking",
            label: "Thinking",
            description: "More thinking is slower and uses more tokens.",
            type: new DefaultDataTypes.SelectType({ items: THINKING_ITEMS }),
          },
        ],
      },
      {
        id: "approvals",
        navGroup: ASSISTANT_GROUP,
        label: "Approvals",
        icon: "i-ph-hand-palm",
        description: "What the agent may do without asking.",
        fields: [
          {
            id: "approvalMode",
            label: "Default mode",
            type: new DefaultDataTypes.SelectType({ items: APPROVAL_ITEMS }),
            required: true,
          },
          {
            id: "alwaysAsk",
            label: "Always ask for",
            description: "These ask in every mode.",
            type: new DefaultDataTypes.SelectType({
              items: ALWAYS_ASK_ITEMS,
              multiple: true,
            }),
          },
        ],
      },
      {
        id: "scope",
        navGroup: WORKSPACE_GROUP,
        label: "Scope",
        icon: "i-ph-shield-check",
        description: "Where the agent works.",
        fields: [
          {
            id: "access",
            label: "Access",
            description: "A field group inside a section.",
            orientation: "vertical",
            fields: [
              {
                id: "workspaceRoot",
                label: "Workspace root",
                description: "Folder the agent may read and write.",
                type: new DefaultDataTypes.StringType({ minLength: 2 }),
                required: true,
              },
              {
                id: "allowedHosts",
                label: "Allowed hosts",
                description: "One per line.",
                type: new DefaultDataTypes.StringType({
                  textarea: true,
                  rows: 3,
                }),
              },
            ],
          },
        ],
      },
      {
        id: "skills",
        navGroup: WORKSPACE_GROUP,
        label: "Skills",
        icon: "i-ph-books",
        fields: [
          {
            id: "skillsEnabled",
            label: "Load module skills",
            type: new DefaultDataTypes.BooleanType(),
          },
          {
            id: "skillsPath",
            label: "Extra skills folder",
            type: new DefaultDataTypes.StringType(),
          },
        ],
      },
      {
        id: "usage",
        navGroup: WORKSPACE_GROUP,
        label: "Usage & history",
        icon: "i-ph-chart-bar",
        fields: [
          {
            id: "retentionDays",
            label: "Keep history for",
            description: "Days, 1 to 365.",
            type: new DefaultDataTypes.NumberType({ min: 1, max: 365 }),
            required: true,
          },
          {
            id: "notify",
            label: "Notify me in the DMS",
            type: new DefaultDataTypes.BooleanType(),
          },
        ],
      },
    ],
  });
}
