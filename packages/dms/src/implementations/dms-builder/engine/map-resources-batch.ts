import path from "node:path";
import type { RelationDescription } from "@antelopejs/interface-database-catalog";
import type {
  LeftOutColumn,
  MapResourcesInput,
  OpWarning,
} from "@antelopejs/interface-dms-builder";
import type { DisplayDefaults } from "./display-defaults";
import { MappingRefusal, refuse } from "./mapping-refusal";
import { RoutesOf } from "./mapped-routes";
import {
  dependents,
  raiseFlags,
  readableLabel,
  safeTabs,
} from "./map-resources-repairs";
import {
  type BatchTarget,
  type MappingPlan,
  type PlannedResource,
  describedAs,
  namesFor,
  plannedFields,
  relationName,
} from "./map-resources-plan";
import { plannedPage } from "./planned-page";
import type { ResourceNames } from "./resource-emit";
import { humanized, words } from "./name-words";
import { moduleMismatch } from "./modules";
import { findCategoryRecord } from "./source-index";

function targetsOf(
  input: MapResourcesInput,
  descriptions: RelationDescription[],
  mapped: BatchTarget[],
  warnings: OpWarning[],
  refused: Map<string, string>,
): Map<string, BatchTarget> {
  const targets = new Map<string, BatchTarget>(
    mapped.map((target) => [target.resource.relation, target]),
  );
  const batch = new Set<string>();
  for (const resource of input.resources) {
    let description: RelationDescription;
    let names: ResourceNames;
    try {
      description = describedAs(descriptions, resource.relation);
      names = namesFor(input, resource, description);
    } catch (error) {
      if (error instanceof MappingRefusal) {
        refused.set(resource.relation, error.message);
        continue;
      }
      throw error;
    }
    if (batch.has(resource.relation)) {
      refuse(`${resource.relation} is in the batch twice`);
    }
    batch.add(resource.relation);
    if (
      [...targets.values()].some(
        (target) =>
          target.names.className === names.className &&
          target.resource.relation !== resource.relation,
      )
    ) {
      refuse(
        `two relations map to class ${names.className}; give one a className`,
      );
    }
    const tableView = resource.tableView && description.key !== null;
    const label = readableLabel(resource, description, warnings);
    targets.set(resource.relation, {
      resource: { ...resource, tableView, label },
      description,
      names,
      ref: names.route.replace(/^\/api\//, ""),
    });
  }
  return targets;
}

/** The title a call sends for a page, which is also its TableView's caption. A blank one is none. */
function sentTitle(title: string | undefined): string | undefined {
  return title?.trim() ? title : undefined;
}

/** What planning one relation reads and adds to. */
interface PlanContext {
  targets: Map<string, BatchTarget>;
  module: string;
  srcRoot: string;
  defaults: ReadonlyMap<string, DisplayDefaults>;
  leftOut: LeftOutColumn[];
  warnings: OpWarning[];
}

/**
 * A category a page may be written in: one that exists and that the tables module declares itself,
 * since a module loads only its own sources. Made with `CreateCategory` and the module's id.
 */
function checkCategory(category: string | undefined, module: string): void {
  if (category === undefined) {
    return;
  }
  const record = findCategoryRecord(category);
  if (!record) {
    refuse(
      `the category "${category}" does not exist: create it with builder_create_category first`,
    );
  }
  const mismatch = moduleMismatch(
    module,
    record.importModule,
    `the category "${category}"`,
  );
  if (mismatch) {
    refuse(
      `${mismatch}: create the category with module "${module}" to put mapped pages in it`,
    );
  }
}

function planResource(
  target: BatchTarget,
  context: PlanContext,
): PlannedResource {
  const { targets, srcRoot, defaults, leftOut, warnings } = context;
  const relationDefaults = defaults.get(target.resource.relation);
  checkCategory(target.resource.category, context.module);
  const { tableFields, apiFields, displays, unproposed } = plannedFields({
    resource: target.resource,
    description: target.description,
    targets,
    leftOut,
    warnings,
    defaults: relationDefaults,
  });
  const description = target.description;
  const where = relationName(description);
  if (unproposed) {
    warnings.push({
      code: "display_not_proposed",
      message: `${where}: the profile could not be read and no analysis was kept, so no text column was proposed a badge; send a display to set one`,
    });
  }
  const page = plannedPage(target.resource);
  const explicitTabs = target.resource.tabs?.column;
  const badge = explicitTabs ? displays.get(explicitTabs) : undefined;
  raiseFlags(
    where,
    apiFields,
    page.tableOptions,
    badge?.kind === "badge" ? explicitTabs : undefined,
    warnings,
  );
  const { tabs, dropped } = safeTabs(
    {
      resource: target.resource,
      where,
      apiFields,
      displays,
      proposed: relationDefaults?.kind === "new",
      kept:
        relationDefaults?.kind === "mapped" ? relationDefaults.tabs : undefined,
    },
    warnings,
  );
  return {
    relation: target.resource.relation,
    description,
    names: target.names,
    ref: target.ref,
    folder: path.join(
      srcRoot,
      ...[description.schema, description.name].map((part) =>
        words(part).join("-"),
      ),
    ),
    tableFields,
    apiFields,
    hasKey: description.key !== null,
    tableView: target.resource.tableView,
    routes: RoutesOf(target.resource),
    label: target.resource.label,
    title: sentTitle(target.resource.title),
    displayName:
      sentTitle(target.resource.title) ?? humanized(description.name),
    page,
    tabs,
    clearTabs:
      (target.resource.tabs === null || dropped) &&
      relationDefaults?.kind === "mapped" &&
      relationDefaults.tabs !== undefined,
  };
}

/**
 * Checks every choice against the catalog's descriptions and plans what each relation becomes.
 * A column or tabs left out take what `defaults` holds for their relation. A choice that only
 * dresses a column (a display, tabs, a label, a flag) is corrected with a warning. A choice a
 * relation cannot do without is refused for that relation alone: the others are planned, and
 * `refused` says why each was left out.
 */
export function planMapping(
  input: MapResourcesInput,
  descriptions: RelationDescription[],
  srcRoot: string,
  mapped: BatchTarget[] = [],
  defaults: ReadonlyMap<string, DisplayDefaults> = new Map(),
): MappingPlan {
  const leftOut: LeftOutColumn[] = [];
  const warnings: OpWarning[] = [];
  const refused = new Map<string, string>();
  const targets = targetsOf(input, descriptions, mapped, warnings, refused);
  const plans = new Map<string, PlannedResource>();
  for (const resource of input.resources) {
    const target = targets.get(resource.relation);
    if (!target || refused.has(resource.relation)) {
      continue;
    }
    const mine: OpWarning[] = [];
    const mineLeftOut: LeftOutColumn[] = [];
    try {
      plans.set(
        resource.relation,
        planResource(target, {
          targets,
          module: input.module,
          srcRoot,
          defaults,
          leftOut: mineLeftOut,
          warnings: mine,
        }),
      );
      warnings.push(...mine);
      leftOut.push(...mineLeftOut);
    } catch (error) {
      if (!(error instanceof MappingRefusal)) {
        throw error;
      }
      refused.set(resource.relation, error.message);
    }
  }
  dependents(input, refused);
  const resources = input.resources.flatMap((resource) => {
    const plan = plans.get(resource.relation);
    return plan && !refused.has(resource.relation) ? [plan] : [];
  });
  const reasons = [...refused].map(
    ([relation, reason]) => `${relation}: ${reason}`,
  );
  for (const reason of reasons) {
    warnings.push({
      code: "relation_skipped",
      message: `${reason}: not written`,
    });
  }
  return { resources, leftOut, warnings, refused: reasons };
}
