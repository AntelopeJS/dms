import { registerFieldTypes } from "./registerFieldTypes";
import type { DataType } from "#dms-core/app/composables/data-types/useDataType";
import { registerMetricCellTypes } from "./metricCells";
import { registerTwoLineCellType } from "./twoLineCell";
import {
  registerPrimitiveTypes,
  registerDateType,
  registerBooleanType,
  registerAddressType,
} from "./defaultPrimitiveTypes";
import {
  renderIndicator,
  registerStatusType,
  registerSelectType,
} from "./defaultChoiceTypes";
import { registerLinkTypes } from "./defaultLinkTypes";
import {
  registerRelationType,
  registerCascaderRelationType,
} from "./defaultRelationTypes";
import {
  registerImageType,
  registerFileType,
  registerDisplayOnlyTypes,
} from "./defaultMediaTypes";
import { renderIdentity, renderPills } from "./defaultIdentityCells";
import { renderRelativeDate, renderMissingDate } from "./defaultDateCells";

/**
 * Cell data types a column picks through its `display` option, composing the
 * row's fields: reusable by any table.
 */
const registerCellTypes = (registerDataType: (dataType: DataType) => void) => {
  registerDataType({
    id: "identity",
    formatter: {
      default: (value, _locale, options, row) =>
        renderIdentity(value, options, row),
      empty: (_value, _locale, options, row) =>
        renderIdentity("", options, row),
    },
  });
  registerDataType({
    id: "pills",
    formatter: {
      default: (value, _locale, options, row) =>
        renderPills(value, options, row),
      empty: (_value, _locale, options, row) => renderPills([], options, row),
    },
  });
  registerDataType({
    id: "relative_date",
    formatter: {
      default: (value, locale, options, row) =>
        renderRelativeDate(value, locale, options, row),
      empty: (_value, _locale, options) => renderMissingDate(options),
    },
  });
  registerDataType({
    id: "indicator",
    formatter: {
      default: (value, _locale, options) => renderIndicator(value, options),
      empty: (_value, _locale, options) => renderIndicator(false, options),
    },
  });
};

export function registerDefaultDataTypes() {
  const { registerDataType } = useDataTypes();

  registerPrimitiveTypes(registerDataType);
  registerDateType(registerDataType);
  registerBooleanType(registerDataType);
  registerStatusType(registerDataType);
  registerSelectType(registerDataType);
  registerAddressType(registerDataType);
  registerImageType(registerDataType);
  registerLinkTypes(registerDataType);
  registerRelationType(registerDataType);
  registerCascaderRelationType(registerDataType);
  registerFileType(registerDataType);
  registerDisplayOnlyTypes(registerDataType);
  registerCellTypes(registerDataType);
  registerMetricCellTypes(registerDataType);
  registerTwoLineCellType(registerDataType);
  registerFieldTypes(registerDataType);
}
