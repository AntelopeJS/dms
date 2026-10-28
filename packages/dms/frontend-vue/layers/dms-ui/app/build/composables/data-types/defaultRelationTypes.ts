import type {
  DataType,
  DataTypeFormatter,
} from "#dms-core/app/composables/data-types/useDataType";
import { isObject } from "#dms-core/app/utils/type-check";
import UAvatar from "@nuxt/ui/components/Avatar.vue";
import UBadge from "@nuxt/ui/components/Badge.vue";
import {
  buildRelationBadges,
  MAX_RELATION_BADGES,
  readRelationLabel,
} from "./relationBadges";
import {
  DEFAULT_RELATION_VALUE_KEY,
  mapRelationBeforeState,
  sameRelationValue,
} from "./relationValue";
import { NotFoundRelation, relationSelectSource } from "./relationRows";
import { getAppTranslation } from "../../../../../dms-core/app/composables/translation/useTranslation";
import { CascaderPath } from "./defaultDisplayComponents";

const DEFAULT_RELATION_LABEL_KEY = "name";

type CellOptions = Parameters<DataTypeFormatter>[2];

type CellValue = Parameters<DataTypeFormatter>[0];

const RELATION_BADGES_CLASS = "inline-flex flex-wrap items-center gap-1";

const RELATION_BADGE_CLASS = "max-w-40";

interface RelationOptions {
  multiple?: boolean;
  keyMapping?: { label?: string; avatar?: string; value?: string };
}

interface CascaderRelationOptions {
  multiple?: boolean;
  searchUrl?: string;
  keyMapping?: {
    label?: string;
    value?: string;
    parent?: string;
    disabled?: string;
  };
}

function renderRelationBadge(label: string, title?: string) {
  return h(UBadge, {
    label,
    title: title ?? label,
    color: "neutral",
    variant: "subtle",
    size: Size.small,
    class: RELATION_BADGE_CLASS,
  });
}

function renderNotFoundRelation(relation: NotFoundRelation) {
  const { t } = getAppTranslation();
  return h(
    "span",
    { class: "text-muted", title: relation.id },
    t("dms.form.relation.not_found"),
  );
}

function renderRelationBadges(
  values: unknown[],
  labelKey: string,
  valueKey: string,
) {
  const { processI18n, t } = getAppTranslation();
  const notFound = values.filter(
    (item): item is NotFoundRelation => item instanceof NotFoundRelation,
  );
  const { visible, hidden } = buildRelationBadges(
    values.filter((item) => !(item instanceof NotFoundRelation)),
    labelKey,
    MAX_RELATION_BADGES,
    valueKey,
  );
  const badges = [
    ...visible.map((label) => renderRelationBadge(processI18n(label))),
    ...notFound.map((relation) =>
      renderRelationBadge(t("dms.form.relation.not_found"), relation.id),
    ),
  ];
  if (hidden.length > 0) {
    const hiddenLabels = hidden.map((label) => processI18n(label)).join(", ");
    badges.push(renderRelationBadge(`+${hidden.length}`, hiddenLabels));
  }
  return h("span", { class: RELATION_BADGES_CLASS }, badges);
}

function renderRelation(value: CellValue, options: CellOptions) {
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Relation options cross the erased plugin boundary; multiple and keyMapping retain unchecked reads.
  const opts = options as RelationOptions | undefined;
  const labelKey = opts?.keyMapping?.label || DEFAULT_RELATION_LABEL_KEY;
  const valueKey = opts?.keyMapping?.value || DEFAULT_RELATION_VALUE_KEY;

  if (opts?.multiple && Array.isArray(value)) {
    return renderRelationBadges(value, labelKey, valueKey);
  }

  if (value instanceof NotFoundRelation) return renderNotFoundRelation(value);
  if (!value || !isObject(value)) return value;

  const valueObject = value;
  const avatarKey = opts?.keyMapping?.avatar;
  const label = readRelationLabel(value, labelKey, valueKey);

  if (!avatarKey || !valueObject[avatarKey]) return label;

  return h("span", { class: "inline-flex items-center gap-2" }, [
    h(UAvatar, {
      // @ts-expect-error A truthy relation avatar field is still an unvalidated plugin value, wider than UAvatar's src contract; forward it unchanged.
      src: valueObject[avatarKey],
      alt: String(label),
      size: Size.tiny,
    }),
    h("span", String(label)),
  ]);
}

function renderCascaderRelation(value: CellValue, options: CellOptions) {
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- DataTypeFormatter erases cascader options; preserve their unchecked handoff to CascaderPath.
  const opts = options as CascaderRelationOptions | undefined;

  if (!value) return value;

  return h(CascaderPath, {
    value,
    searchUrl: opts?.searchUrl,
    keyMapping: opts?.keyMapping,
  });
}

export const registerRelationType = (
  registerDataType: (dataType: DataType) => void,
) => {
  registerDataType({
    id: "relation",
    formatter: {
      default: (value, _locale, options) => renderRelation(value, options),
    },
    beforeStateMapper: mapRelationBeforeState,
    isSameValue: sameRelationValue,
    selectSource: relationSelectSource,
  });
};

export const registerCascaderRelationType = (
  registerDataType: (dataType: DataType) => void,
) => {
  registerDataType({
    id: "cascader_relation",
    formatter: {
      default: (value, _locale, options) =>
        renderCascaderRelation(value, options),
    },
    beforeStateMapper: mapRelationBeforeState,
    isSameValue: sameRelationValue,
    selectSource: relationSelectSource,
  });
};
