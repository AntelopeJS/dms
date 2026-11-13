import {
  Node,
  type ObjectLiteralExpression,
  type Project,
  type PropertyAssignment,
  type SourceFile,
  SyntaxKind,
} from "ts-morph";
import type { MappingPlan } from "./map-resources-plan";
import type { ResourceRecord } from "./resource-index";
import type { Transaction } from "./writable";

const RELATION_TYPE = "RelationType";

function relationConfigs(file: SourceFile): ObjectLiteralExpression[] {
  return file.getDescendantsOfKind(SyntaxKind.NewExpression).flatMap((call) => {
    const config = call.getArguments()[0];
    return call.getExpression().getText().endsWith(RELATION_TYPE) &&
      Node.isObjectLiteralExpression(config)
      ? [config]
      : [];
  });
}

function labelText(property: PropertyAssignment): string | undefined {
  const value = property.getInitializer();
  return Node.isStringLiteral(value) ||
    Node.isNoSubstitutionTemplateLiteral(value)
    ? value.getLiteralValue()
    : value?.getText();
}

/** The `keyMapping` objects of the relation columns in `file` pointing at `apiName`. */
function pointingMappings(
  file: SourceFile,
  apiName: string,
): ObjectLiteralExpression[] {
  return relationConfigs(file).flatMap((config) => {
    const controller = config.getProperty("dataApiController");
    const keyMapping = config.getProperty("keyMapping");
    if (
      !Node.isPropertyAssignment(controller) ||
      controller.getInitializer()?.getText() !== apiName ||
      !Node.isPropertyAssignment(keyMapping)
    ) {
      return [];
    }
    const mapping = keyMapping.getInitializer();
    return Node.isObjectLiteralExpression(mapping) ? [mapping] : [];
  });
}

/** The labels of the relation columns in `file` pointing at `apiName` that do not read `label` yet. */
function staleLabels(
  file: SourceFile,
  apiName: string,
  label: string,
): PropertyAssignment[] {
  return pointingMappings(file, apiName).flatMap((mapping) => {
    const current = mapping.getProperty("label");
    return Node.isPropertyAssignment(current) && labelText(current) !== label
      ? [current]
      : [];
  });
}

/** The module's mapped relations outside the batch, with their data-api file. */
function otherFiles(
  project: Project,
  records: Map<string, ResourceRecord>,
  plan: MappingPlan,
): [string, SourceFile][] {
  const batch = new Set(plan.resources.map((resource) => resource.relation));
  return [...records].flatMap(([relation, record]): [string, SourceFile][] => {
    const file = batch.has(relation)
      ? undefined
      : project.getSourceFile(record.dataApiFile);
    return file ? [[relation, file]] : [];
  });
}

/**
 * Why the batch cannot be written, when it leaves a relation with no label while a column of the
 * module's other relations shows it by its label: that column would point at nothing to show.
 */
export function unlabelledTargetRefusal(
  project: Project,
  records: Map<string, ResourceRecord>,
  plan: MappingPlan,
): string | undefined {
  const unlabelled = plan.resources.filter((resource) => !resource.label);
  for (const [relation, file] of otherFiles(project, records, plan)) {
    const target = unlabelled.find(
      (resource) => pointingMappings(file, resource.names.apiName).length > 0,
    );
    if (target) {
      return `${relation} refers to ${target.relation}, which would have no label to show`;
    }
  }
  return undefined;
}

/**
 * The module's other mapped relations show the batch's relations by their label: a column
 * pointing at one follows its new label, so it does not keep showing the old one.
 */
export function relabelPointingColumns(
  project: Project,
  transaction: Transaction,
  records: Map<string, ResourceRecord>,
  plan: MappingPlan,
): void {
  const labelled = plan.resources.filter((resource) => resource.label);
  if (labelled.length === 0) {
    return;
  }
  for (const [, file] of otherFiles(project, records, plan)) {
    const stale = labelled.flatMap((resource) =>
      staleLabels(file, resource.names.apiName, resource.label!).map(
        (property) => ({ property, label: resource.label! }),
      ),
    );
    if (stale.length === 0) {
      continue;
    }
    transaction.track(file);
    for (const { property, label } of stale) {
      property.setInitializer(JSON.stringify(label));
    }
  }
}
