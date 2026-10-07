import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
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

/**
 * A module's settings as one form split into sections: a side list follows
 * the scroll, marks the sections holding unsaved changes or errors, and the
 * save bar names the changed sections.
 */
@RegisterPage()
export class PageFormSections extends PageController(
  "form-sections",
  {
    displayName: "Sections",
    icon: "i-ph-list-dashes",
    category: pageCategory,
    order: 6,
    description: "Module settings: one form split into sections",
  },
  FormPageLayout(),
) {
  static form = Form({
    title: "Assistant settings",
    description:
      "Defaults for new conversations. Change a value in any section: the list marks it, and the save bar names it.",
    fetchUrl: "/api/form-sections/get",
    submitUrl: "/api/form-sections/save",
    sections: [
      {
        id: "agent",
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
        label: "Scope",
        icon: "i-ph-shield-check",
        description: "Where the agent works.",
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
            type: new DefaultDataTypes.StringType({ textarea: true, rows: 3 }),
          },
        ],
      },
      {
        id: "skills",
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
