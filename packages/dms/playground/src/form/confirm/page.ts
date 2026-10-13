import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { Banner, KeyValueList } from "@antelopejs/interface-dms/base";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form";
import {
  FormPageLayout,
  type PageHeaderButton,
} from "@antelopejs/interface-dms/base/layouts";
import { ButtonVariant } from "@antelopejs/interface-dms/base/types";
import { pageCategory } from "../category";

export const FORM_CONFIRM_API = "/api/form-confirm";
export const WORKSPACE_NAME = "Acme";
const MEMBER_COUNT = 6;
const TABLE_COUNT = 42;

const deleteAction: PageHeaderButton = {
  id: "delete",
  label: "Delete workspace",
  icon: "i-ph-trash",
  color: "error",
  target: {
    type: "api",
    method: "POST",
    url: `${FORM_CONFIRM_API}/delete`,
    successMessage: "Workspace reset",
  },
  confirm: {
    title: "Delete {name}?",
    params: { name: WORKSPACE_NAME },
    color: "error",
    icon: "i-ph-trash",
    description: "Type the workspace name, in any case, to confirm.",
    confirmText: WORKSPACE_NAME,
    confirmTextCaseInsensitive: true,
    confirmLabel: "Delete",
    cancelLabel: "Keep it",
    impact: [
      {
        icon: "i-ph-users",
        label: "$demo.form_pages.impact_members",
        count: MEMBER_COUNT,
      },
      {
        icon: "i-ph-database",
        label: "$demo.form_pages.impact_tables",
        count: TABLE_COUNT,
      },
    ],
    secondaryAction: {
      label: "Download a backup",
      icon: "i-ph-download-simple",
      target: {
        type: "download",
        url: `${FORM_CONFIRM_API}/backup`,
        filename: "{name}-backup.json",
      },
    },
  },
};

const transferAction: PageHeaderButton = {
  id: "transfer",
  label: "Transfer ownership",
  icon: "i-ph-crown",
  variant: ButtonVariant.outline,
  target: {
    type: "api",
    method: "POST",
    url: `${FORM_CONFIRM_API}/transfer`,
    body: { notify: true },
    successMessage: "Ownership transferred",
  },
  confirm: {
    title: "Transfer ownership",
    description: "Only a member can take it: try someone@else.io.",
    confirmLabel: "Transfer",
    fields: [
      {
        id: "email",
        label: "New owner",
        type: new DefaultDataTypes.EmailType({
          placeholder: "bruno@acme.io",
        }),
        required: true,
      },
      {
        id: "reason",
        label: "Reason",
        type: new DefaultDataTypes.StringType({ textarea: true, rows: 2 }),
      },
    ],
    secondaryAction: {
      label: "Ownership docs",
      icon: "i-ph-book-open",
      target: {
        type: "external",
        url: "https://antelopejs.com/docs",
        newTab: true,
      },
    },
  },
};

const archiveAction: PageHeaderButton = {
  id: "archive",
  label: "Archive",
  icon: "i-ph-archive",
  variant: ButtonVariant.outline,
  target: {
    type: "api",
    method: "POST",
    url: `${FORM_CONFIRM_API}/archive`,
    successMessage: "Workspace archived",
  },
  confirm: { from: `${FORM_CONFIRM_API}/archive-dialog` },
};

const leaveAction: PageHeaderButton = {
  id: "leave",
  label: "Leave",
  icon: "i-ph-sign-out",
  variant: ButtonVariant.ghost,
  target: {
    type: "api",
    method: "POST",
    url: `${FORM_CONFIRM_API}/leave`,
    successMessage: "You left the workspace",
  },
  confirm: {
    title: "You are the last owner",
    description: "Transfer the ownership first, then leave.",
    icon: "i-ph-lock-simple",
    blocked: true,
    cancelLabel: "Got it",
  },
};

/**
 * The confirmation dialog an action asks in, declared on the backend
 * (`ConfirmDialog`) and opened from the browser (`useConfirm`,
 * `useConfirmFrom`). The header buttons run against the workspace record
 * shown below.
 */
@RegisterPage()
export class PageFormConfirm extends PageController(
  "form-confirm",
  {
    displayName: "Confirmations",
    icon: "i-ph-seal-question",
    category: pageCategory,
    order: 9.1,
    description:
      "Every option of a confirmation dialog: the header buttons declare theirs on the backend, the buttons below open them from a Vue component.",
  },
  FormPageLayout({
    headerActions: [deleteAction, transferAction, archiveAction, leaveAction],
  }),
) {
  static guide = KeyValueList({
    title: "Header buttons",
    items: [
      {
        label: "Delete workspace",
        value:
          "{name} params, impact, a download secondaryAction, confirmText typed in any case (confirmTextCaseInsensitive)",
      },
      {
        label: "Transfer ownership",
        value:
          "fields merged into the api body; a server field error lands under its field; an external secondaryAction",
      },
      {
        label: "Archive",
        value:
          "confirm: { from }: the server words the dialog through serializeConfirmDialog",
      },
      { label: "Leave", value: "blocked: the dialog only explains" },
    ],
  });

  static related = Banner({
    title: "More confirmations",
    description:
      "The basic useConfirm options (impact, typed text, async errors, a body) and confirmations on table row actions.",
    size: "sm",
    actions: [
      { label: "useConfirm basics", to: "/foundations/foundations-overlays" },
      { label: "Row actions", to: "/table-view/table-view-views" },
    ],
  });

  static workspace = Form({
    title: "Workspace",
    description:
      "What the header buttons change. Deleting puts the defaults back.",
    fetchUrl: `${FORM_CONFIRM_API}/get`,
    submitUrl: `${FORM_CONFIRM_API}/save`,
    fields: [
      {
        id: "name",
        label: "Name",
        type: new DefaultDataTypes.StringType({ minLength: 2 }),
        required: true,
      },
      {
        id: "owner",
        label: "Owner",
        type: new DefaultDataTypes.EmailType(),
        readonly: true,
      },
      {
        id: "status",
        label: "Status",
        type: new DefaultDataTypes.StringType(),
        readonly: true,
      },
    ],
  });

  static composables = CustomComponent("FormConfirmComposables").meta({
    name: "useConfirm and useConfirmFrom",
    icon: "i-ph-browser",
  });
}
