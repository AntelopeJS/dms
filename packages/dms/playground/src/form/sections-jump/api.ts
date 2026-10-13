import { DemoRecordController } from "../demo-record-api";
import { PageFormSectionsJump } from "./page";

/** Loads and saves the plan of "Sections, grouped chips". */
export const FormSectionsJumpAPIController = DemoRecordController({
  location: "/api/form-sections-jump",
  guard: PageFormSectionsJump,
  form: PageFormSectionsJump.form,
  record: {
    name: "Pro",
    price: 49,
    interval: "month",
    trialDays: 14,
    taxMode: "exclusive",
    seats: 10,
    storageGb: 100,
    sso: false,
    auditLog: true,
    public: true,
  },
});
