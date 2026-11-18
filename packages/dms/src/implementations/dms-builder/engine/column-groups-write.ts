/** Writing the `@ColumnGroup` decorators of a resource's DataAPI controller. */

import type {
  ColumnGroupSpec,
  ColumnGroupsPatch,
  MutationOpts,
  OpResult,
} from "@antelopejs/interface-dms-builder";
import type { ClassDeclaration, Decorator } from "ts-morph";
import { COLUMN_GROUP, columnGroupSchema } from "./column-groups";
import { ensureNamedImport } from "./emit";
import { stringLiteralValue } from "./literals";
import { commit, invalidConfig, notFound } from "./ops";
import { pruningOrphans } from "./options-patch";
import { TABLE_VIEW_MODULE } from "./resource-emit";
import { findResourceRecord } from "./resource-index";
import { openResource } from "./resource-ops";
import { checkVersion } from "./resource-guards";
import { createImportCollector, serializeValue } from "./value";
import { Transaction } from "./writable";

/** Every `@ColumnGroup` of the controller with the id `id`, readable or not. */
function decoratorsOf(apiClass: ClassDeclaration, id: string): Decorator[] {
  return apiClass
    .getDecorators()
    .filter(
      (decorator) =>
        decorator.getName() === COLUMN_GROUP &&
        stringLiteralValue(decorator.getArguments()[0]) === id,
    );
}

function decoratorArguments(id: string, config: ColumnGroupSpec): string[] {
  const { ctx } = createImportCollector();
  return [JSON.stringify(id), serializeValue({ ...config }, ctx)];
}

/** Why a patch of groups cannot be written: an empty id, or a config `@ColumnGroup` does not take. */
function groupsRefusal(groups: ColumnGroupsPatch): string | undefined {
  for (const [id, config] of Object.entries(groups)) {
    if (id.trim() === "") {
      return "a column group's id is not empty";
    }
    const parsed =
      config === null ? undefined : columnGroupSchema.safeParse(config);
    if (parsed && !parsed.success) {
      const issues = parsed.error.issues.map(
        (issue) => `${[id, ...issue.path].join(".")}: ${issue.message}`,
      );
      return `the column group refuses its config: ${issues.join("; ")}`;
    }
  }
  return undefined;
}

/**
 * Write or remove the `@ColumnGroup` decorators of a resource's controller:
 * a group sent replaces the one of its id, or is added after the class's
 * other decorators; `null` removes it. Typechecked like every other write.
 */
export function configureColumnGroups(
  ref: string,
  groups: ColumnGroupsPatch,
  opts?: MutationOpts,
): OpResult {
  const record = findResourceRecord(ref);
  const opened = record && openResource(record);
  if (!opened) {
    return notFound(ref);
  }
  const stale = checkVersion(
    ref,
    opened.databaseFile,
    opened.dataApiFile,
    opts,
  );
  if (stale) {
    return stale;
  }
  const refusal = groupsRefusal(groups);
  if (refusal) {
    return invalidConfig(refusal);
  }
  const { dataApiClass, dataApiFile } = opened;
  const transaction = new Transaction(opened.project);
  transaction.track(dataApiFile);
  pruningOrphans(dataApiFile, () => {
    for (const [id, config] of Object.entries(groups)) {
      const [first, ...others] = decoratorsOf(dataApiClass, id);
      for (const extra of others) {
        extra.remove();
      }
      if (config === null) {
        first?.remove();
        continue;
      }
      const args = decoratorArguments(id, config);
      if (first) {
        first.replaceWithText(`@${COLUMN_GROUP}(${args.join(", ")})`);
      } else {
        dataApiClass.addDecorator({ name: COLUMN_GROUP, arguments: args });
      }
    }
    if (Object.values(groups).some((config) => config !== null)) {
      ensureNamedImport(dataApiFile, COLUMN_GROUP, TABLE_VIEW_MODULE);
    }
  });
  return commit(transaction, undefined);
}
