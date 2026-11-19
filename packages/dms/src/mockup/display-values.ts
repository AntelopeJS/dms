import type {
  ColumnDisplay,
  DataTypeValue,
  DisplayTone,
} from "@antelopejs/interface-dms-builder";

/** A tab of a mockup TableView, as the compiled block config holds it. */
export interface MockupTab {
  id: string;
  label: string;
  filter?: { accessorKey: string; value: string; mode: string };
  textColor?: DisplayTone;
}

/**
 * The DataType a mapped display writes on a mockup column. A mockup has no rows to read badge
 * items or a currency from, so both are written as values.
 */
export function displayValuesDataType(display: ColumnDisplay): DataTypeValue {
  if (display.kind === "price") {
    return display.currency
      ? { $dataType: "price", config: { currency: display.currency } }
      : { $dataType: "price" };
  }
  return {
    $dataType: "select",
    config: {
      items: display.items.map((item) => ({
        label: item.label,
        value: item.value,
        textColor: item.tone,
      })),
    },
  };
}

/** The lowercase words of a name: `orderStatus` and `order_status` → `order`, `status`. */
function words(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.toLowerCase());
}

/** "All", then a tab per value of the badge, in its order, drawn in its tone. */
export function badgeTabs(column: string, display: ColumnDisplay): MockupTab[] {
  if (display.kind !== "badge") return [];
  const taken = new Set<string>(["all"]);
  const tabs = display.items.map((item, index) => {
    const id = [...words(column), ...words(item.value)].join("-");
    const unique = taken.has(id) ? `${id}-${index}` : id;
    taken.add(unique);
    return {
      id: unique,
      label: item.label,
      filter: { accessorKey: column, value: item.value, mode: "is" },
      textColor: item.tone,
    };
  });
  return [{ id: "all", label: "All" }, ...tabs];
}
