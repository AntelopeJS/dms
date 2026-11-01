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
        // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Data type options erase storage's type; file/image registration supplies it, but options are not runtime-validated here.
        storage: options?.storage as string | undefined,
        visibility:
          options?.visibility === "public"
            ? ("public" as const)
            : ("private" as const),
        // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- File/image options carry this attachment contract through an erased generic; validation of arbitrary registrations would change behavior.
        constraints: options?.constraints as AttachmentField["constraints"],
      },
    ];
  });
}
