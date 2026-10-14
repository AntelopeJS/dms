import { DemoRecordController } from "../demo-record-api";
import { PageFormAdvanced } from "./page";

const FORM_ADVANCED_API = "/api/form-advanced";

/** Loads and saves the product form of "Two forms, one page". */
export const FormAdvancedProductAPIController = DemoRecordController({
  location: `${FORM_ADVANCED_API}/product`,
  guard: PageFormAdvanced,
  form: PageFormAdvanced.productForm,
  record: {
    productName: "Premium Laptop",
    category: "electronics",
    price: 990,
    discount: 0.1,
    tags: ["new"],
    stock: 12,
    featured: false,
  },
});

/** Loads and saves the preferences form of "Two forms, one page". */
export const FormAdvancedPreferencesAPIController = DemoRecordController({
  location: `${FORM_ADVANCED_API}/preferences`,
  guard: PageFormAdvanced,
  form: PageFormAdvanced.userPreferences,
  record: { language: "en", fontSize: 14, notifications: ["email"] },
});
