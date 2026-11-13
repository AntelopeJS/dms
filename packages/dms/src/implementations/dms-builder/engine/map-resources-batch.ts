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

/** What planning one relation reads and adds to. */
interface PlanContext {
  targets: Map<string, BatchTarget>;
  srcRoot: string;
  defaults: ReadonlyMap<string, DisplayDefaults>;
  leftOut: LeftOutColumn[];
  warnings: OpWarning[];
}

function planResource(
  target: BatchTarget,
  context: PlanContext,
): PlannedResource {
  const { targets, srcRoot, defaults, leftOut, warnings } = context;
  const relationDefaults = defaults.get(target.resource.relation);
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
    displayName: target.resource.title ?? humanized(description.name),
    page,
    tabs,
    clearTabs:
      (target.resource.tabs === null || dropped) &&
      relationDefaults?.kind === "mapped" &&
      relationDefaults.generatedTabs,
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
  const resources = input.resources.flatMap((resource) =>
    refused.has(resource.relation) ? [] : [plans.get(resource.relation)!],
  );
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
