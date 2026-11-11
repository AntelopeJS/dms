import type {
  RelationDescription,
  RelationProfile,
} from "@antelopejs/interface-database-catalog";
import type {
  ColumnDisplay,
  MapResourcesInput,
  MappedResource,
  ProposedResource,
} from "@antelopejs/interface-dms-builder";
import { latestAnalysis } from "./analysis-job";
import { displayFactsOf } from "./analysis-fields";
import type { CatalogConnection } from "./catalog-connection";
import { proposeDisplay } from "./column-display";
import { currencyOfComment } from "./price-currency";
import { currentColumns, pageOf, tabsColumnOf } from "./mapped-displays";
import { mappedRecordsOf } from "./resource-index";

/** Where the displays proposed for a relation not mapped before come from. */
export type ProposalSource = "profile" | "analysis" | "name";

/**
 * What a field left without a `display` takes, by what the relation was before the call: a
 * relation mapped before keeps what its controller draws each column with, and the labels of its
 * relation columns; a relation not mapped before takes what the rules D1 and D2 propose for the
 * column, as far as `source` lets them see.
 */
export type DisplayDefaults =
  | {
      kind: "mapped";
      displays: ReadonlyMap<string, ColumnDisplay>;
      /** The label each column of the controller shows. */
      labels: ReadonlyMap<string, string>;
      /** Whether the page's tabs are the ones the mapping wrote from a badge. */
      generatedTabs: boolean;
    }
  | {
      kind: "new";
      source: ProposalSource;
      propose: (column: string, declared: string) => ColumnDisplay | undefined;
    };

/** Whether a field is one a default can reach: it left its `display` out and is not a relation. */
function takesDefault(field: MappedResource["fields"][number]): boolean {
  return field.display === undefined && field.relation === undefined;
}

async function profileOf(
  catalog: CatalogConnection,
  relation: string,
): Promise<RelationProfile | undefined> {
  try {
    return (await catalog.Profile({ relation })) ?? undefined;
  } catch {
    return undefined;
  }
}

function analysedResource(
  input: MapResourcesInput,
  relation: string,
): ProposedResource | undefined {
  const latest = latestAnalysis(input.connection);
  const proposal = latest.ok ? latest.data.proposal : undefined;
  return proposal?.module === input.module
    ? proposal.resources.find((resource) => resource.relation === relation)
    : undefined;
}

function proposedBy(
  description: RelationDescription,
  profile: RelationProfile,
): DisplayDefaults {
  const facts = {
    relation: `${description.schema}.${description.name}`,
    description,
    profile,
    rows: null,
  };
  return {
    kind: "new",
    source: "profile",
    propose: (column, declared) =>
      proposeDisplay(displayFactsOf(facts, column, declared, false))?.display,
  };
}

function proposedByName(description?: RelationDescription): DisplayDefaults {
  return {
    kind: "new",
    source: "name",
    propose: (column, declared) =>
      proposeDisplay({
        column,
        declared,
        isRelation: false,
        enumLike: false,
        currency:
          description && declared === "number"
            ? currencyOfComment(
                description.columns.find((entry) => entry.name === column)
                  ?.comment,
              )
            : undefined,
      })?.display,
  };
}

async function newRelation(
  input: MapResourcesInput,
  resource: MappedResource,
  description: RelationDescription | undefined,
  catalog: CatalogConnection,
): Promise<DisplayDefaults> {
  if (!description || !resource.fields.some(takesDefault)) {
    return proposedByName(description);
  }
  const profile = await profileOf(catalog, resource.relation);
  if (profile) {
    return proposedBy(description, profile);
  }
  const analysed = analysedResource(input, resource.relation);
  return analysed
    ? {
        kind: "new",
        source: "analysis",
        propose: (column) =>
          analysed.fields.find((field) => field.column === column)?.display
            ?.value,
      }
    : proposedByName(description);
}

/**
 * The defaults of each relation of the call, read before anything is written. A relation mapped
 * before answers from its code; one not mapped before from its profile at map time, else from the
 * connection's last analysis, else from its columns' names alone.
 */
export async function displayDefaultsOf(
  input: MapResourcesInput,
  descriptions: RelationDescription[],
  catalog: CatalogConnection,
): Promise<Map<string, DisplayDefaults>> {
  const mapped = mappedRecordsOf(input.module);
  const defaults = new Map<string, DisplayDefaults>();
  for (const resource of input.resources) {
    const record = mapped.get(resource.relation);
    if (record) {
      const { displays, labels } = currentColumns(record);
      defaults.set(resource.relation, {
        kind: "mapped",
        displays,
        labels,
        generatedTabs:
          tabsColumnOf(pageOf(input.connection, record), displays) !==
          undefined,
      });
      continue;
    }
    const description = descriptions.find(
      (candidate) =>
        `${candidate.schema}.${candidate.name}` === resource.relation,
    );
    defaults.set(
      resource.relation,
      await newRelation(input, resource, description, catalog),
    );
  }
  return defaults;
}
