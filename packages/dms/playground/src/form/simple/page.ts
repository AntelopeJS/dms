import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Form } from "@antelopejs/interface-dms/base/form-schema";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import { pageCategory } from "../category";

@RegisterPage()
export class PageFormSimple extends PageController(
  "form-simple",
  {
    displayName: "Simple Form",
    icon: "i-ph-note-pencil",
    category: pageCategory,
    order: 0,
    description: "Simple form showcasing all field types",
    setupId: "dms:demo:form-lifecycle",
  },
  FormPageLayout(),
) {
  static form = Form({
    title: "Simple Form Example",
    description: "A form showcasing all available field types",
    fields: [
      {
        id: "textField",
        label: "Text Input",
        description: "Enter any text",
        type: new DefaultDataTypes.StringType({
          placeholder: "Enter text here...",
          maxLength: 100,
        }),
      },
      {
        id: "textareaField",
        label: "Textarea Input",
        description: "Enter multiline text",
        type: new DefaultDataTypes.StringType({
          placeholder: "Enter multiline text here...",
          maxLength: 500,
          textarea: true,
          rows: 4,
        }),
      },
      {
        id: "emailField",
        label: "Email Input",
        description: "Enter a valid email address",
        type: new DefaultDataTypes.EmailType({
          placeholder: "email@example.com",
        }),
      },
      {
        id: "numberField",
        label: "Number Input",
        description: "Enter a number between 0 and 100",
        type: new DefaultDataTypes.NumberType({
          min: 0,
          max: 100,
          step: 5,
          placeholder: "Enter a number",
        }),
      },
      {
        id: "checkboxField",
        label: "Checkbox",
        description: "Check to agree",
        type: new DefaultDataTypes.BooleanType(),
      },
      {
        id: "selectField",
        label: "Select",
        description: "Choose an option",
        type: new DefaultDataTypes.SelectType({
          items: [
            { label: "Option 1", value: "option1" },
            { label: "Option 2", value: "option2" },
            { label: "Option 3", value: "option3" },
            { label: "Option 4 (Disabled)", value: "option4", disabled: true },
          ],
          placeholder: "Select an option...",
        }),
      },
      {
        id: "calendarField",
        label: "Date Calendar",
        description: "Select a date",
        type: new DefaultDataTypes.DateType(),
      },
      {
        id: "calendarRangeField",
        label: "Date Range Calendar",
        description: "Select a date range",
        type: new DefaultDataTypes.DateType({ range: true }),
      },
      {
        id: "calendarMultipleField",
        label: "Multiple Dates Calendar",
        description: "Select multiple dates",
        type: new DefaultDataTypes.DateType({ multiple: true }),
      },
      {
        id: "colorField",
        label: "Color Picker",
        description: "Pick a color (hex)",
        type: new DefaultDataTypes.ColorType({
          placeholder: "#3b82f6",
        }),
        defaultValue: "#3b82f6",
      },
    ],
  });
}
