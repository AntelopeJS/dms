import { describe, expect, it } from "vitest";
import { resolveI18nKey } from "../layers/dms-core/app/composables/translation/useTranslation";
import { resolveTableEmptyState } from "../layers/dms-ui/app/build/composables/table-view/utils/emptyState";

const translate = (text: string) => resolveI18nKey((key) => `t(${key})`, text);

describe("resolveTableEmptyState", () => {
  it("falls back to the generic empty table text", () => {
    expect(resolveTableEmptyState(undefined, translate)).toEqual({
      title: "t(dms.table.empty_title)",
      description: "t(dms.table.empty_message)",
    });
  });

  it("translates the keys the table declares", () => {
    expect(
      resolveTableEmptyState(
        {
          title: "$saas.invoices.empty_title",
          description: "$saas.invoices.empty_message",
        },
        translate,
      ),
    ).toEqual({
      title: "t(saas.invoices.empty_title)",
      description: "t(saas.invoices.empty_message)",
    });
  });

  it("keeps the generic text for the part the table omits", () => {
    expect(
      resolveTableEmptyState({ description: "No invoice yet" }, translate),
    ).toEqual({
      title: "t(dms.table.empty_title)",
      description: "No invoice yet",
    });
  });
});
