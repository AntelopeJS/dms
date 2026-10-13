import { DemoRecordController } from "../demo-record-api";
import { PageFormSimple } from "./page";

/** Loads and saves the "Simple form" demo. */
export const FormSimpleAPIController = DemoRecordController({
  location: "/api/form-simple",
  guard: PageFormSimple,
  form: PageFormSimple.form,
  record: {
    textField: "Hello",
    emailField: "ada@acme.io",
    numberField: 50,
    checkboxField: true,
    selectField: "option2",
    colorField: "#3b82f6",
  },
});
