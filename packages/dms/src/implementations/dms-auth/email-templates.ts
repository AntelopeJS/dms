import { RegisterHtmlTemplate } from "@antelopejs/interface-dms/html-render";
import type { AdminInviteEmailNames } from "../../utils";
import "./account-emails";

interface AdminInviteData extends AdminInviteEmailNames {
  email: string;
  signupLink: string;
  expiresInDays: number;
}

export const AdminInviteTemplate =
  RegisterHtmlTemplate<AdminInviteData>("EmailAdminInvite");
