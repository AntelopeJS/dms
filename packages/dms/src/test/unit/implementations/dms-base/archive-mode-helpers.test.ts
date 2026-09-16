import type { TableViewRowActionOptions } from "@antelopejs/interface-dms/base/table-view";
import type {
  RowActionConfig,
  RowActionRule,
} from "@antelopejs/interface-dms/base/types/row-action";
import { expect } from "chai";
import { applyArchiveModeDefaultRules } from "@antelopejs/interface-dms/base/helpers/archive-mode-helpers";

const ARCHIVE_FIELD = "isArchived";

const DEFAULT_MANAGED_ACTIONS = [
  "edit",
  "duplicate",
  "archive",
  "restore",
  "delete",
] as const;

const ACTIONS_NOT_EQUALS_TRUE = ["edit", "duplicate", "archive"] as const;
const ACTIONS_EQUALS_TRUE = ["restore", "delete"] as const;

function getConfig(
  result: TableViewRowActionOptions | undefined,
  action: (typeof DEFAULT_MANAGED_ACTIONS)[number],
): RowActionConfig | undefined {
  const value = result?.[action];
  if (typeof value === "object" && value !== null) {
    return value;
  }
  return undefined;
}

describe("[unit] interfaces/dms-base/helpers/archive-mode-helpers", () => {
  describe("applyArchiveModeDefaultRules with no user config", () => {
    it("enables all managed actions with default rules", () => {
      const result = applyArchiveModeDefaultRules(undefined, ARCHIVE_FIELD);

      for (const action of DEFAULT_MANAGED_ACTIONS) {
        const config = getConfig(result, action);
        expect(config).to.exist;
        expect(config?.isEnabled).to.equal(true);
      }
    });

    it("applies notEquals=true rule for edit/duplicate/archive", () => {
      const result = applyArchiveModeDefaultRules(undefined, ARCHIVE_FIELD);

      for (const action of ACTIONS_NOT_EQUALS_TRUE) {
        const rule = getConfig(result, action)?.rule as RowActionRule;
        expect(rule).to.deep.equal({
          field: ARCHIVE_FIELD,
          notEquals: true,
        });
      }
    });

    it("applies equals=true rule for restore/delete", () => {
      const result = applyArchiveModeDefaultRules(undefined, ARCHIVE_FIELD);

      for (const action of ACTIONS_EQUALS_TRUE) {
        const rule = getConfig(result, action)?.rule as RowActionRule;
        expect(rule).to.deep.equal({
          field: ARCHIVE_FIELD,
          equals: true,
        });
      }
    });
  });

  describe("applyArchiveModeDefaultRules with user overrides", () => {
    it("skips actions explicitly disabled with false", () => {
      const input: TableViewRowActionOptions = { edit: false };
      const result = applyArchiveModeDefaultRules(input, ARCHIVE_FIELD);

      expect(result?.edit).to.equal(false);
    });

    it("skips actions explicitly disabled with enabled=false", () => {
      const input: TableViewRowActionOptions = {
        edit: { isEnabled: false },
      };
      const result = applyArchiveModeDefaultRules(input, ARCHIVE_FIELD);

      expect((result?.edit as RowActionConfig)?.isEnabled).to.equal(false);
    });

    it("applies default rule when user passes true", () => {
      const input: TableViewRowActionOptions = { delete: true };
      const result = applyArchiveModeDefaultRules(input, ARCHIVE_FIELD);

      const config = getConfig(result, "delete");
      expect(config?.isEnabled).to.equal(true);
      expect(config?.rule).to.deep.equal({
        field: ARCHIVE_FIELD,
        equals: true,
      });
    });

    it("preserves user rule when provided", () => {
      const customRule: RowActionRule = { field: "custom", equals: "value" };
      const input: TableViewRowActionOptions = {
        edit: { isEnabled: true, rule: customRule },
      };
      const result = applyArchiveModeDefaultRules(input, ARCHIVE_FIELD);

      expect((result?.edit as RowActionConfig)?.rule).to.deep.equal(customRule);
    });

    it("adds default rule when user config has no rule", () => {
      const input: TableViewRowActionOptions = {
        edit: { isEnabled: true },
      };
      const result = applyArchiveModeDefaultRules(input, ARCHIVE_FIELD);

      const config = getConfig(result, "edit");
      expect(config?.isEnabled).to.equal(true);
      expect(config?.rule).to.deep.equal({
        field: ARCHIVE_FIELD,
        notEquals: true,
      });
    });
  });

  describe("applyArchiveModeDefaultRules preservation", () => {
    it("does not mutate the original rowActions object", () => {
      const input: TableViewRowActionOptions = { edit: true };
      const snapshot = JSON.stringify(input);

      applyArchiveModeDefaultRules(input, ARCHIVE_FIELD);

      expect(JSON.stringify(input)).to.equal(snapshot);
    });

    it("preserves unrelated user actions passing through", () => {
      const input: TableViewRowActionOptions = {
        add: true,
        hasSelection: true,
      };
      const result = applyArchiveModeDefaultRules(input, ARCHIVE_FIELD);

      expect(result?.add).to.equal(true);
      expect(result?.hasSelection).to.equal(true);
    });

    it("uses the provided archive field name in generated rules", () => {
      const altField = "deleted";
      const result = applyArchiveModeDefaultRules(undefined, altField);

      const rule = getConfig(result, "edit")?.rule as RowActionRule;
      expect(rule).to.deep.equal({ field: altField, notEquals: true });
    });
  });
});
