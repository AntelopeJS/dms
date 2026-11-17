import type { RelationDescription } from "@antelopejs/interface-database-catalog";
import type {
  MappedField,
  MappedResource,
  MapResourcesInput,
} from "@antelopejs/interface-dms-builder";
import { mappedRecordsOf } from "./resource-index";

function nameOf(description: RelationDescription): string {
  return `${description.schema}.${description.name}`;
}

/** The relation a column's declared single-column foreign key points at, with the key it uses. */
function declaredTarget(
  description: RelationDescription,
  column: string,
): { relation: string; key: string } | undefined {
  const reference = description.references.find(
    (candidate) =>
      candidate.from.columns.length === 1 &&
      candidate.from.columns[0] === column &&
      candidate.to.columns.length === 1,
  );
  return reference
    ? { relation: reference.to.relation, key: reference.to.columns[0] }
    : undefined;
}

/** The relations outside the batch that the declared foreign keys of its columns point at. */
export function declaredTargetsOutside(
  input: MapResourcesInput,
  descriptions: RelationDescription[],
): string[] {
  const batch = new Set(input.resources.map((resource) => resource.relation));
  const found = new Set<string>();
  for (const resource of input.resources) {
    const description = descriptions.find(
      (candidate) => nameOf(candidate) === resource.relation,
    );
    for (const field of resource.fields) {
      const target =
        description &&
        field.relation === undefined &&
        declaredTarget(description, field.column);
      if (target && !batch.has(target.relation)) {
        found.add(target.relation);
      }
    }
  }
  return [...found];
}

/**
 * Whether a column may show the row it points at by default: the target is in the batch or was
 * mapped before, has a TableView and a single-column key that the foreign key points at.
 */
function canShowTarget(
  input: MapResourcesInput,
  descriptions: RelationDescription[],
  from: RelationDescription,
  target: { relation: string; key: string },
): boolean {
  if (target.relation === nameOf(from)) {
    return false;
  }
  const described = descriptions.find(
    (candidate) => nameOf(candidate) === target.relation,
  );
  if (
    described?.key?.columns.length !== 1 ||
    described.key.columns[0] !== target.key
  ) {
    return false;
  }
  const inBatch = input.resources.find(
    (resource) => resource.relation === target.relation,
  );
  if (inBatch) {
    return inBatch.tableView;
  }
  const record = mappedRecordsOf(input.module).get(target.relation);
  return (
    record !== undefined &&
    (record.routes === undefined || record.routes.length > 0)
  );
}

function resolved(
  input: MapResourcesInput,
  descriptions: RelationDescription[],
  resource: MappedResource,
): MappedField[] {
  const description = descriptions.find(
    (candidate) => nameOf(candidate) === resource.relation,
  );
  return resource.fields.map((field) => {
    if (field.relation === null) {
      return { ...field, relation: undefined };
    }
    if (field.relation !== undefined) {
      return field;
    }
    const target = description && declaredTarget(description, field.column);
    return target && canShowTarget(input, descriptions, description, target)
      ? { ...field, relation: target.relation }
      : field;
  });
}

/**
 * Makes a column a relation column when the database declares it a foreign key onto a relation
 * the batch or the module maps with a TableView, and the call does not say otherwise. A `relation`
 * sent is kept; `null` writes the column plain.
 */
export function withDeclaredRelations(
  input: MapResourcesInput,
  descriptions: RelationDescription[],
): MapResourcesInput {
  return {
    ...input,
    resources: input.resources.map((resource) => ({
      ...resource,
      fields: resolved(input, descriptions, resource),
    })),
  };
}
