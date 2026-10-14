import { DemoRecordController } from "../demo-record-api";
import { PageFormGrouped } from "./page";

/** Loads and saves the "Field groups" demo: the groups' fields as flat keys. */
export const FormGroupedAPIController = DemoRecordController({
  location: "/api/form-grouped",
  guard: PageFormGrouped,
  form: PageFormGrouped.form,
  record: {
    username: "ada",
    email: "ada@acme.io",
    city: "Brussels",
    country: "fr",
    newsletter: true,
  },
});
