import { BasicDataModel } from "@antelopejs/interface-database-decorators";
import { Attachment, attachmentsTableName } from "../tables/attachments.table";

export class AttachmentModel extends BasicDataModel(
  Attachment,
  attachmentsTableName,
) {}
