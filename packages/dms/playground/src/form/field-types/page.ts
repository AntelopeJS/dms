import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import { pageCategory } from "../category";

const PLAN_ITEMS = [
  { label: "Starter", value: "starter", description: "3 projects, 10 GB" },
  { label: "Pro", value: "pro", description: "Unlimited projects, 100 GB" },
  { label: "Enterprise", value: "enterprise", description: "SSO, audit log" },
];

const THINKING_ITEMS = [
  { label: "Off", value: "off" },
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
];

const QUERY_COMPLETIONS = [
  { label: "orders", detail: "1,284 rows", icon: "i-ph-table" },
  { label: "customers", detail: "4,960 rows", icon: "i-ph-table" },
];

/**
 * Every field type and display the form offers beyond the plain inputs:
 * select displays, boolean displays, a repeater, key-value pairs, tags, a
 * secret, a value to copy, code, and the notes a field can carry.
 */
@RegisterPage()
export class PageFormFieldTypes extends PageController(
  "form-field-types",
  {
    displayName: "Field types",
    icon: "i-ph-shapes",
    category: pageCategory,
    order: 8,
    description: "Select and boolean displays, repeaters, tags, secrets, code",
  },
  FormPageLayout(),
) {
  static form = Form({
    title: "Integration settings",
    description:
      "Change a value to see “Changed · was …”; the retention field shows its module default.",
    fetchUrl: "/api/form-field-types/get",
    submitUrl: "/api/form-field-types/save",
    sections: [
      {
        id: "choices",
        label: "Choices",
        icon: "i-ph-check-square",
        fields: [
          {
            id: "plan",
            label: "Plan",
            description: "Select as cards, with descriptions",
            type: new DefaultDataTypes.SelectType({
              items: PLAN_ITEMS,
              display: "cards",
            }),
            required: true,
          },
          {
            id: "addons",
            label: "Add-ons",
            description: "Several cards picked",
            type: new DefaultDataTypes.SelectType({
              items: PLAN_ITEMS,
              display: "cards",
              multiple: true,
            }),
          },
          {
            id: "thinking",
            label: "Thinking",
            description: "Select as segments",
            type: new DefaultDataTypes.SelectType({
              items: THINKING_ITEMS,
              display: "segmented",
            }),
          },
          {
            id: "region",
            label: "Region",
            description: "Select as radios",
            type: new DefaultDataTypes.SelectType({
              items: [
                { label: "Europe", value: "eu", description: "Frankfurt" },
                { label: "United States", value: "us", description: "Ohio" },
              ],
              display: "radio",
            }),
          },
          {
            id: "auditLog",
            label: "Audit log",
            type: new DefaultDataTypes.BooleanType({
              label: "Included",
              description: "Who changed what, 90 days",
            }),
          },
          {
            id: "terms",
            label: "Terms",
            type: new DefaultDataTypes.BooleanType({
              display: "checkbox",
              label: "I accept the data processing terms",
            }),
            required: true,
          },
          {
            id: "owner",
            label: "Ownership",
            type: new DefaultDataTypes.BooleanType({
              display: "card",
              icon: "i-ph-crown",
              label: "Make them a workspace owner",
              description: "Owners hold every permission and manage billing.",
            }),
          },
        ],
      },
      {
        id: "lists",
        label: "Lists",
        icon: "i-ph-list-plus",
        fields: [
          {
            id: "categories",
            label: "Categories",
            description: "A sortable repeater, 1 to 5 rows",
            hint: "Drag the handle, or focus it and use the arrow keys.",
            type: new DefaultDataTypes.ArrayType({
              of: {
                name: {
                  type: new DefaultDataTypes.StringType(),
                  label: "Name",
                  required: true,
                },
                templates: {
                  type: new DefaultDataTypes.NumberType({ min: 0 }),
                  label: "Templates",
                },
              },
              sortable: true,
              min: 1,
              max: 5,
              addLabel: "Add a category",
            }),
          },
          {
            id: "headers",
            label: "Headers",
            description: "Key-value pairs, each turned on or off",
            type: new DefaultDataTypes.KeyValueType({
              toggleable: true,
              addLabel: "Add header",
            }),
          },
          {
            id: "recipients",
            label: "Recipients",
            description: "Tags: addresses, at most 5",
            type: new DefaultDataTypes.TagsType({
              itemType: "email",
              max: 5,
              suggestions: ["ops@acme.io", "billing@acme.io"],
              placeholder: "Type or paste addresses",
            }),
          },
        ],
      },
      {
        id: "secrets",
        label: "Secrets & code",
        icon: "i-ph-key",
        fields: [
          {
            id: "webhookUrl",
            label: "Webhook URL",
            description: "A value to copy",
            type: new DefaultDataTypes.StringType({ copyable: true }),
          },
          {
            id: "webhookSecret",
            label: "Webhook secret",
            description: "Masked, revealed and copied in the browser",
            type: new DefaultDataTypes.SecretType({
              rotateUrl: "/api/form-field-types/rotate",
            }),
          },
          {
            id: "payload",
            label: "Payload",
            description: "JSON, checked as you type",
            type: new DefaultDataTypes.CodeType({
              language: "json",
              minLines: 4,
              maxLines: 10,
            }),
          },
          {
            id: "query",
            label: "Query",
            description: "SQL with the module's suggestions (Ctrl+Space)",
            type: new DefaultDataTypes.CodeType({
              language: "sql",
              minLines: 3,
              completions: QUERY_COMPLETIONS,
              completionsUrl: "/api/form-field-types/completions",
            }),
          },
        ],
      },
      {
        id: "notes",
        label: "Field notes",
        icon: "i-ph-note",
        fields: [
          {
            id: "retention",
            label: "Keep history for (days)",
            hint: "Older entries are deleted every night.",
            type: new DefaultDataTypes.NumberType({ min: 1, max: 365 }),
            defaultValue: 30,
          },
          {
            id: "billingEmail",
            label: "Billing email",
            type: new DefaultDataTypes.EmailType(),
            readonly: {
              badge: { label: "Verified", tone: "success" },
              link: {
                label: "Change in Security",
                to: "/settings/user/security",
              },
            },
          },
        ],
      },
    ],
  });
}
