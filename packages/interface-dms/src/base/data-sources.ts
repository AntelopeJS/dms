import type { BlockOptionSchema, BlockResponseShape } from "./block-registry";

/**
 * A route a developer wrote, offered to a source editor as something a block can
 * be pointed at.
 *
 * The builder generates the ordinary calculations — a measure per group, a count,
 * a total — but some data is a join, a call to another service, or a rule nobody
 * would want expressed as parameters. Declaring such a route puts it in the same
 * list as the generated ones: the editor shows its title, asks for its
 * parameters, and writes the URL. Nothing here is ever read or rewritten as code,
 * so a declared source cannot be broken by a tool that did not write it.
 */
export interface DataSourceDefinition {
  /** Stable id, used to address the source once a block points at it. */
  id: string;
  /** What a person picking a source reads. */
  title: string;
  description?: string;
  /** The shape the route answers with, so only blocks that can read it offer it. */
  responseShape: BlockResponseShape;
  /** The route's path, as a block would fetch it. */
  path: string;
  /** Defaults to GET; a source that changes something is not a source. */
  method?: "GET" | "POST";
  /**
   * The parameters the route takes, described the way a block's options are, so
   * an editor can render them with the controls it already has.
   */
  params?: Record<string, BlockOptionSchema>;
  /**
   * The period the route reads from the query string, when it takes one. A
   * source that says so can be bound to a page's period selector.
   */
  period?: DataSourcePeriod;
}

/** The query parameters a source reads its period bounds from. */
export interface DataSourcePeriod {
  from: string;
  to: string;
}

const SOURCES = new Map<string, DataSourceDefinition>();

/**
 * Declare a route as a data source a block may be pointed at.
 *
 * Called next to the route it describes, so the two move together: a source
 * whose declaration lives elsewhere outlives the route it names.
 */
export function RegisterDataSource(definition: DataSourceDefinition): void {
  const previous = SOURCES.get(definition.id);
  if (previous && previous !== definition) {
    console.warn(
      `[dms-base] data source "${definition.id}" is registered again and the previous declaration is replaced`,
    );
  }
  SOURCES.set(definition.id, definition);
}

/**
 * Every declared source, optionally narrowed to those a given block can read.
 *
 * A live read rather than a snapshot: a module loaded later contributes its
 * sources without anything having to invalidate a cache.
 */
export function ListDataSources(
  responseShape?: BlockResponseShape,
): DataSourceDefinition[] {
  const all = Array.from(SOURCES.values());
  return responseShape
    ? all.filter((source) => source.responseShape === responseShape)
    : all;
}

/** One declared source, or `undefined` when nothing claims that id. */
export function GetDataSource(id: string): DataSourceDefinition | undefined {
  return SOURCES.get(id);
}
