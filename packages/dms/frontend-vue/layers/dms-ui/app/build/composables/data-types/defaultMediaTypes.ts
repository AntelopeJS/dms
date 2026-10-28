import type {
  DataType,
  DataTypeFormatter,
} from "#dms-core/app/composables/data-types/useDataType";
import { isObject, isString } from "#dms-core/app/utils/type-check";
import UAvatar from "@nuxt/ui/components/Avatar.vue";
import { getAppTranslation } from "../../../../../dms-core/app/composables/translation/useTranslation";
import {
  FilePreview,
  ImagePreview,
  DisplayRichText,
  DisplayPassword,
  DisplayFile,
  DisplayImage,
  DisplayColor,
} from "./defaultDisplayComponents";

type CellOptions = Parameters<DataTypeFormatter>[2];

type CellValue = Parameters<DataTypeFormatter>[0];

interface FileOptions {
  multiple?: boolean;
  storage?: string;
}

interface ImageOptions {
  multiple?: boolean;
  storage?: string;
}

function toImageList(value: CellValue): ImageItemValue[] {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.filter(
    (item): item is ImageItemValue => isObject(item) && isString(item.key),
  );
}

function renderImage(value: CellValue, options: CellOptions) {
  if (isString(value)) {
    return h(UAvatar, { src: value, alt: value });
  }

  const images = toImageList(value);
  if (!images.length) return "";

  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- DataTypeFormatter erases image options; storage is forwarded without validation.
  const opts = options as ImageOptions | undefined;
  return h(ImagePreview, { images, storage: opts?.storage });
}

function renderFile(value: CellValue, options: CellOptions) {
  const { t } = getAppTranslation();
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- File options are erased by the plugin contract; multiple and storage retain their existing unchecked behavior.
  const opts = options as FileOptions | undefined;

  if (opts?.multiple && Array.isArray(value)) {
    return t("dms.form.file.count", { count: value.length });
  }

  if (isString(value)) {
    return h(FilePreview, { resourceKey: value, storage: opts?.storage });
  }

  return "";
}

export const registerImageType = (
  registerDataType: (dataType: DataType) => void,
) => {
  registerDataType({
    id: "image",
    formatter: {
      default: (value, _locale, options) => renderImage(value, options),
    },
    displayComponent: DisplayImage,
  });
};

export const registerFileType = (
  registerDataType: (dataType: DataType) => void,
) => {
  registerDataType({
    id: "file",
    formatter: {
      default: (value, _locale, options) => renderFile(value, options),
    },
    displayComponent: DisplayFile,
  });
};

export const registerDisplayOnlyTypes = (
  registerDataType: (dataType: DataType) => void,
) => {
  registerDataType({ id: "rich_text", displayComponent: DisplayRichText });
  registerDataType({ id: "password", displayComponent: DisplayPassword });
  registerDataType({
    id: "color",
    displayComponent: DisplayColor,
    formatter: {
      default: (value, _locale) => (isString(value) ? value : ""),
    },
  });
};
