import type { AttachmentField } from "@antelopejs/interface-dms/attachments";
import { getDataTypeId } from "@antelopejs/interface-dms/base/data-types";
import type { TableViewMeta } from "@antelopejs/interface-dms/base/table-view/meta";
import { isString } from "@antelopejs/interface-dms/utils/internal/type-check";

export function tableAttachmentFields(
  meta: TableViewMeta,
  scope: string,
): AttachmentField[] {
  return Object.entries(meta.columns).flatMap(([key, column]) => {
    const kind = getDataTypeId(column.type);
    if (kind !== "file" && kind !== "image") return [];
    const options = column.type.options;
    return [
      {
        id: `${scope}#${key}`,
        key,
        kind,
        storage: isString(options?.storage) ? options.storage : undefined,
        visibility:
          options?.visibility === "public"
            ? ("public" as const)
            : ("private" as const),
        // SAFETY: The registry ids file and image name FileType and ImageType, whose options are FileTypeOptions or ImageTypeOptions, where constraints is the UploadConstraints AttachmentField declares.
        constraints: options?.constraints as AttachmentField["constraints"],
      },
    ];
  });
}
