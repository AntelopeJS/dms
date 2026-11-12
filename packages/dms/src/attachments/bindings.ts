import type { AttachmentField } from "@antelopejs/interface-dms/attachments";
import { getDataTypeId } from "@antelopejs/interface-dms/base/data-types";
import type { TableViewMeta } from "@antelopejs/interface-dms/base/table-view/meta";

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
        // SAFETY: A file or image data type declares storage as a string in FileTypeOptions and ImageTypeOptions; DataType erases its options to unknown values and getDataTypeId names the type by registered id, so no guard on the instance narrows them.
        storage: options?.storage as string | undefined,
        visibility:
          options?.visibility === "public"
            ? ("public" as const)
            : ("private" as const),
        // SAFETY: A file or image data type declares constraints as UploadConstraints in FileTypeOptions and ImageTypeOptions; DataType erases its options to unknown values and getDataTypeId names the type by registered id, so no guard on the instance narrows them.
        constraints: options?.constraints as AttachmentField["constraints"],
      },
    ];
  });
}
