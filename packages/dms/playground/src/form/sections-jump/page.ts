import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import { pageCategory } from "../category";

const INTERVAL_ITEMS = [
  { label: "Monthly", value: "month" },
  { label: "Yearly", value: "year" },
];

const TAX_ITEMS = [
  { label: "Exclusive", value: "exclusive" },
  { label: "Inclusive", value: "inclusive" },
];

const BILLING_GROUP = "Billing";
const LIMITS_GROUP = "Limits";
const PUBLISHING_GROUP = "Publishing";

/**
 * A plan editor whose side column would hold a preview: its sections are
 * listed as chips above the form (`sectionNav: "jump"`), and `navGroup`
 * leads each run of chips with its label.
 */
@RegisterPage()
export class PageFormSectionsJump extends PageController(
  "form-sections-jump",
  {
    displayName: "Sections, grouped chips",
    icon: "i-ph-tag",
    category: pageCategory,
    order: 6.5,
    description: "Jump navigation with section groups",
  },
  FormPageLayout(),
) {
  static form = Form({
    title: "Edit plan",
    description:
      "The chips lead to each section, grouped under their navGroup label.",
    sectionNav: "jump",
    sections: [
      {
        id: "identity",
        label: "Identity",
        fields: [
          {
            id: "name",
            label: "Name",
            type: new DefaultDataTypes.StringType(),
            required: true,
          },
          {
            id: "tagline",
            label: "Tagline",
            type: new DefaultDataTypes.StringType(),
          },
        ],
      },
      {
        id: "pricing",
        label: "Pricing",
        navGroup: BILLING_GROUP,
        fields: [
          {
            id: "price",
            label: "Price",
            type: new DefaultDataTypes.NumberType({ min: 0 }),
          },
          {
            id: "interval",
            label: "Interval",
            type: new DefaultDataTypes.SelectType({ items: INTERVAL_ITEMS }),
          },
        ],
      },
      {
        id: "trial",
        label: "Trial",
        navGroup: BILLING_GROUP,
        fields: [
          {
            id: "trialDays",
            label: "Trial length",
            description: "Days, 0 for none.",
            type: new DefaultDataTypes.NumberType({ min: 0 }),
          },
        ],
      },
      {
        id: "taxes",
        label: "Taxes",
        navGroup: BILLING_GROUP,
        fields: [
          {
            id: "taxMode",
            label: "Prices are",
            type: new DefaultDataTypes.SelectType({ items: TAX_ITEMS }),
          },
        ],
      },
      {
        id: "quotas",
        label: "Quotas",
        navGroup: LIMITS_GROUP,
        fields: [
          {
            id: "seats",
            label: "Seats",
            type: new DefaultDataTypes.NumberType({ min: 1 }),
          },
          {
            id: "storageGb",
            label: "Storage (GB)",
            type: new DefaultDataTypes.NumberType({ min: 0 }),
          },
        ],
      },
      {
        id: "features",
        label: "Features",
        navGroup: LIMITS_GROUP,
        fields: [
          {
            id: "sso",
            label: "Single sign-on",
            type: new DefaultDataTypes.BooleanType(),
          },
          {
            id: "auditLog",
            label: "Audit log",
            type: new DefaultDataTypes.BooleanType(),
          },
        ],
      },
      {
        id: "visibility",
        label: "Visibility",
        navGroup: PUBLISHING_GROUP,
        fields: [
          {
            id: "public",
            label: "Shown on the pricing page",
            type: new DefaultDataTypes.BooleanType(),
          },
        ],
      },
      {
        id: "terms",
        label: "Terms",
        navGroup: PUBLISHING_GROUP,
        fields: [
          {
            id: "termsUrl",
            label: "Terms URL",
            type: new DefaultDataTypes.StringType(),
          },
        ],
      },
    ],
  });
}
