import { Get, Parameter, PartialController } from "@antelopejs/interface-api";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { serializeConfirmDialog } from "@antelopejs/interface-dms/base/confirm-dialog";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import { DemoRecordController } from "../demo-record-api";
import { FORM_CUSTOM_INPUT_API, PageFormCustomInput } from "./page";

const DEFAULT_RETENTION_DAYS = 28;

/** Loads and saves the "Custom input" demo form. */
export const FormCustomInputRecordAPI = DemoRecordController({
  location: FORM_CUSTOM_INPUT_API,
  guard: PageFormCustomInput,
  form: PageFormCustomInput.form,
  record: { name: "Audit log", retentionDays: DEFAULT_RETENTION_DAYS },
});

/** The dialog the custom input asks before a save lowers the retention. */
export class FormCustomInputAPIController extends PartialController(
  FormCustomInputRecordAPI,
) {
  @AuthUserWithPermission(PageFormCustomInput)
  declare user: User;

  @Get("lower-retention")
  lowerRetention(@Parameter("days", "query") days?: string) {
    return serializeConfirmDialog({
      title: "Delete history older than {days} days?",
      description: "Older entries are deleted at the next save. Type delete.",
      params: { days },
      color: "error",
      icon: "i-ph-trash",
      confirmLabel: "Delete and save",
      confirmText: "DELETE",
      confirmTextCaseInsensitive: true,
    });
  }
}
