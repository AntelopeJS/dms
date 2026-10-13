import { DemoRecordController } from "../demo-record-api";
import { PageFormLocalized } from "./page";

/** Loads and saves the "Localized fields" demo: one value per locale. */
export const FormLocalizedAPIController = DemoRecordController({
  location: "/api/form-localized",
  guard: PageFormLocalized,
  form: PageFormLocalized.form,
  record: {
    title: { en: "Spring sale", fr: "Soldes de printemps" },
    description: { en: "Everything at half price." },
    slug: "spring-sale",
    published: false,
  },
});
