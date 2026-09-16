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
        storage: options?.storage as string | undefined,
        visibility:
          options?.visibility === "public"
            ? ("public" as const)
            : ("private" as const),
        constraints: options?.constraints as AttachmentField["constraints"],
      },
    ];
  });
}
