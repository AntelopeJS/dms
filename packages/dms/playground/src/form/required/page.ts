import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form, FormComponents } from "@antelopejs/interface-dms/base/form";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import { pageCategory } from "../category";
import { userDataAPI } from "../../table-view/data-api";
import { cascaderCategoryDataAPI } from "../../table-view/cascader-mode/data-api";
import { demoAddForm } from "../../table-view/form-texts";

const PRIORITY_ITEMS = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
];

const TAG_ITEMS = [
  { label: "New", value: "new" },
  { label: "Featured", value: "featured" },
  { label: "On sale", value: "sale" },
];

const DEPARTMENT_TREE = [
  {
    label: "Engineering",
    value: "eng",
    children: [
      { label: "Frontend", value: "eng-frontend" },
      { label: "Backend", value: "eng-backend" },
    ],
  },
  {
    label: "Sales",
    value: "sales",
    children: [{ label: "Inside sales", value: "sales-inside" }],
  },
];

/**
 * Every field type the generic form renders, each one required, plus a few
 * constraints: submitting it empty shows how each control flags a missing
 * value, and the submit endpoint re-checks everything server-side (and
 * refuses the username `admin` to show a server field error).
 */
@RegisterPage()
export class PageFormRequired extends PageController(
  "form-required",
  {
    displayName: "Required & Validation",
    icon: "i-ph-asterisk",
    category: pageCategory,
    order: 5,
    description:
      "Every field type, required, with constraint and server-side errors",
  },
  FormPageLayout(),
) {
  static form = Form({
    title: "Required fields",
    description:
      "Type in any field, then validate: every other control shows its error. The username admin is taken (server-side error).",
    submitUrl: "/api/form-required/submit",
    submitLabel: "Validate",
    successMessage: "Every field is valid. Nothing was saved.",
    fields: [
      {
        id: "username",
        label: "Username",
        description: "3 to 20 characters",
        type: new DefaultDataTypes.StringType({
          placeholder: "e.g. ada",
          minLength: 3,
          maxLength: 20,
        }),
        required: true,
      },
      {
        id: "title",
        label: "Title (translated)",
        description: "A localized text",
        type: new DefaultDataTypes.StringType({ placeholder: "Title" }),
        localized: true,
        required: true,
      },
      {
        id: "notes",
        label: "Notes",
        type: new DefaultDataTypes.StringType({
          textarea: true,
          rows: 3,
          maxLength: 200,
        }),
        required: true,
      },
      {
        id: "contact",
        label: "Contact",
        description: "A group: email and phone (international format)",
        fields: [
          {
            id: "email",
            type: new DefaultDataTypes.EmailType({
              placeholder: "email@example.com",
            }),
            required: true,
          },
          {
            id: "phone",
            type: new DefaultDataTypes.PhoneType({
              placeholder: "+32470123456",
              requiredPrefix: true,
            }),
            required: true,
          },
        ],
      },
      {
        id: "website",
        label: "Website",
        type: new DefaultDataTypes.UrlType({ placeholder: "https://…" }),
        required: true,
      },
      {
        id: "password",
        label: "Password",
        description: "At least 8 characters",
        type: new DefaultDataTypes.PasswordType({ minLength: 8 }),
        required: true,
      },
      {
        id: "quantity",
        label: "Quantity",
        description: "Between 1 and 10",
        type: new DefaultDataTypes.NumberType({ min: 1, max: 10, step: 1 }),
        required: true,
      },
      {
        id: "price",
        label: "Price",
        type: new DefaultDataTypes.PriceType({ min: 0 }),
        required: true,
      },
      {
        id: "discount",
        label: "Discount",
        type: new DefaultDataTypes.PercentageType({ min: 0, max: 0.5 }),
        required: true,
      },
      {
        id: "rating",
        label: "Rating",
        description: "A slider",
        type: new DefaultDataTypes.NumberType({ min: 0, max: 5 }),
        inputComponent: FormComponents.InputSlider({ min: 0, max: 5 }),
        required: true,
      },
      {
        id: "priority",
        label: "Priority",
        type: new DefaultDataTypes.SelectType({
          items: PRIORITY_ITEMS,
          placeholder: "Choose…",
        }),
        required: true,
      },
      {
        id: "tags",
        label: "Tags",
        type: new DefaultDataTypes.SelectType({
          items: TAG_ITEMS,
          multiple: true,
          placeholder: "Choose tags…",
        }),
        required: true,
      },
      {
        id: "size",
        label: "Size",
        description: "A radio group",
        type: new DefaultDataTypes.SelectType({
          items: [
            { label: "Small", value: "s" },
            { label: "Large", value: "l" },
          ],
        }),
        inputComponent: FormComponents.InputRadioGroup({
          items: [
            { label: "Small", value: "s" },
            { label: "Large", value: "l" },
          ],
          orientation: "horizontal",
        }),
        required: true,
      },
      {
        id: "startDate",
        label: "Start date",
        description: "A date picker, within 2026",
        type: new DefaultDataTypes.DateType({
          minDate: "2026-01-01",
          maxDate: "2026-12-31",
        }),
        required: true,
      },
      {
        id: "vacation",
        label: "Vacation",
        description: "A date range",
        type: new DefaultDataTypes.DateType({ range: true }),
        required: true,
      },
      {
        id: "period",
        label: "Reporting period",
        description: "A range picked in two calendars, start then end",
        type: new DefaultDataTypes.DateType({ range: true }),
        inputComponent: FormComponents.DatePickerRange(),
        required: true,
      },
      {
        id: "holidays",
        label: "Holidays",
        description: "Several dates",
        type: new DefaultDataTypes.DateType({ multiple: true }),
        required: true,
      },
      {
        id: "meetingDay",
        label: "Meeting day",
        description: "An inline calendar",
        type: new DefaultDataTypes.DateType(),
        inputComponent: FormComponents.Calendar(),
        required: true,
      },
      {
        id: "duration",
        label: "Duration",
        description: "A time span: 01:30 or 1h30m",
        type: new DefaultDataTypes.StringTimeType({ placeholder: "01:30" }),
        required: true,
      },
      {
        id: "brandColor",
        label: "Brand colour",
        type: new DefaultDataTypes.ColorType({ placeholder: "#3b82f6" }),
        required: true,
      },
      {
        id: "assignee",
        label: "Assignee",
        description: "A relation",
        type: new DefaultDataTypes.RelationType({
          dataApiController: userDataAPI,
          placeholder: "Pick a user…",
          addForm: demoAddForm("user"),
          keyMapping: { label: "name", value: "_id", avatar: "avatar" },
        }),
        required: true,
      },
      {
        id: "category",
        label: "Category",
        description: "A cascader",
        type: new DefaultDataTypes.CascaderRelationType({
          dataApiController: cascaderCategoryDataAPI,
          placeholder: "Select a category",
          keyMapping: { label: "name", value: "_id", parent: "parent" },
        }),
        required: true,
      },
      {
        id: "department",
        label: "Department",
        description: "A tree",
        type: new DefaultDataTypes.TreeType({ items: DEPARTMENT_TREE }),
        required: true,
      },
      {
        id: "description",
        label: "Description",
        description: "Rich text: an empty document counts as empty",
        type: new DefaultDataTypes.RichTextType(),
        required: true,
      },
      {
        id: "address",
        label: "Address",
        type: new DefaultDataTypes.AddressType(),
        required: true,
      },
      {
        id: "contract",
        label: "Contract",
        description: "A file",
        type: new DefaultDataTypes.FileType({ path: "demo/required" }),
        required: true,
      },
      {
        id: "cover",
        label: "Cover",
        description: "An image",
        type: new DefaultDataTypes.ImageType({ path: "demo/required" }),
        required: true,
      },
      {
        id: "gallery",
        label: "Gallery",
        description: "Several images",
        type: new DefaultDataTypes.ImageType({
          multiple: true,
          max: 4,
          path: "demo/required",
        }),
        required: true,
      },
      {
        id: "newsletter",
        label: "Newsletter",
        description:
          "A switch always holds a value (off is a value): never flagged",
        type: new DefaultDataTypes.BooleanType(),
        required: true,
      },
      {
        id: "terms",
        label: "Terms",
        description:
          "A box to tick: required, only ticking it fills it (unlike a switch)",
        type: new DefaultDataTypes.BooleanType(),
        inputComponent: FormComponents.InputCheckbox(),
        required: true,
      },
    ],
  });
}
