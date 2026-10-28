import type {
  DataType,
  DataTypeFormatter,
} from "#dms-core/app/composables/data-types/useDataType";
import { isString } from "#dms-core/app/utils/type-check";
import UAvatar from "@nuxt/ui/components/Avatar.vue";
import UIcon from "@nuxt/ui/runtime/vue/components/Icon.vue";
import ULink from "@nuxt/ui/components/Link.vue";
import { type Row } from "./cellHelpers";
import { formatRecordLabel } from "../table-view/utils/formTexts";

type CellOptions = Parameters<DataTypeFormatter>[2];

type CellValue = Parameters<DataTypeFormatter>[0];

const LINK_CLASS =
  "flex items-center gap-1 truncate text-[13px] font-medium text-primary hover:text-primary/80";

const LINK_ICON_CLASS = "size-3 text-primary/70 flex-shrink-0";

const LINK_ICON_NAME = "i-ph-arrow-up-right-light";

interface LinkRendererOptions {
  hrefPrefix?: string;
  target?: string;
}

function createLinkRenderer(options: LinkRendererOptions) {
  return (value: CellValue, _locale: string) => {
    if (!value || !isString(value)) return String(value);

    const href = options.hrefPrefix ? `${options.hrefPrefix}${value}` : value;

    return h(
      ULink,
      {
        to: href,
        title: value,
        ...(options.target && { target: options.target }),
        class: LINK_CLASS,
        onClick: (event: Event) => event.stopPropagation(),
      },
      () => [
        h("span", { class: "truncate" }, value),
        h(UIcon, { name: LINK_ICON_NAME, class: LINK_ICON_CLASS }),
      ],
    );
  };
}

/** A `UrlType`'s options its read-only value reads. */
interface UrlOptions {
  preview?: "avatar" | "image";
  /**
   * The label of the field shown, handed by the form's read-only display:
   * the image's name when its row has none.
   */
  fieldLabel?: string;
}

const URL_IMAGE_CLASS =
  "border-default h-16 w-auto max-w-full rounded-md border object-cover";

const ROW_NAME_FIELDS = ["name", "label", "title"];

/**
 * What an image stands for to a reader who cannot see it: the name of the
 * row it belongs to (a team member's photo is that member), or else the
 * field's label.
 */
function imageAlt(row: Row, locale: string, options: UrlOptions): string {
  for (const field of ROW_NAME_FIELDS) {
    const name = formatRecordLabel(row?.[field], locale);
    if (name) return name;
  }
  return options.fieldLabel ?? "";
}

/**
 * A URL drawn as the image it points to, when its type asks for it
 * (`preview`): a remote photo reads as a picture, not as its address.
 */
function renderUrl(
  value: CellValue,
  locale: string,
  options: CellOptions,
  row: Row,
) {
  const opts: UrlOptions = options ?? {};
  if (!opts.preview || !isString(value) || !value) return undefined;
  const alt = imageAlt(row, locale, opts);
  if (opts.preview === "avatar") return h(UAvatar, { src: value, alt });
  return h("img", {
    src: value,
    alt,
    loading: "lazy",
    class: URL_IMAGE_CLASS,
  });
}

export const registerLinkTypes = (
  registerDataType: (dataType: DataType) => void,
) => {
  registerDataType({
    id: "email",
    formatter: { default: createLinkRenderer({ hrefPrefix: "mailto:" }) },
  });
  const renderLink = createLinkRenderer({ target: "_blank" });
  registerDataType({
    id: "url",
    formatter: {
      default: (value, locale, options, row) =>
        renderUrl(value, locale, options, row) ?? renderLink(value, locale),
    },
  });
};
