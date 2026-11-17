import type {
  BlockNode,
  BlockPath,
  ConfigObject,
  ConfigureTableViewOpts,
  ConfigValue,
  FileChange,
  FooterSummarySetting,
  OpResult,
  OpWarning,
  TableDisplayId,
  TableViewSettings,
  ValidationIssue,
  ViewSetting,
  ViewsSetting,
} from "@antelopejs/interface-dms-builder";
import { configureBlock, invalidConfig, unsupported } from "./ops";
import { configureField } from "./resource-ops-delete";
import { Check, type Column, columnOf } from "./table-view-checks";
import { buildPageStructure } from "./page-structure";
import { mountSummaryRoute } from "./resource-summary-route";
import { buildResourceStructure } from "./resource-structure";

const TABLE_VIEW = "TableView";
const TABLE: TableDisplayId = "table";
const CARDS: TableDisplayId = "cards";

type Config = NonNullable<BlockNode["config"]>;
type Patch = Parameters<typeof configureBlock>[1];

/** The entries of `fields` that are set: an option left out is not written as `undefined`. */
function present(fields: Config): Config {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  );
}

function findTableViews(blocks: BlockNode[]): BlockNode[] {
  return blocks.flatMap((block) => [
    ...(block.type === TABLE_VIEW ? [block] : []),
    ...findTableViews(block.children ?? []),
  ]);
}

function isRecord(value: ConfigValue): value is ConfigObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

/** The ids of the displays listed in a `displays` option. */
function listedIds(displays: Config[]): string[] {
  return displays.flatMap((entry) => (isString(entry.id) ? [entry.id] : []));
}

function viewOption(view: ViewSetting): Config {
  return present({
    id: view.id,
    label: view.label,
    icon: view.icon || undefined,
    count: view.count,
    filters: view.filters?.length
      ? view.filters.map((filter) =>
          present({
            accessorKey: filter.column,
            value: Array.isArray(filter.value)
              ? filter.value.join(",")
              : filter.value,
            mode: filter.mode ?? "is",
          }),
        )
      : undefined,
    search: view.search || undefined,
    sort: view.sort?.length
      ? view.sort.map((sort) =>
          present({ field: sort.column, desc: sort.desc }),
        )
      : undefined,
    columns: view.columns || undefined,
    display: view.display || undefined,
    density: view.density || undefined,
  });
}

function viewsOption(check: Check, views: ViewsSetting, offered: Set<string>) {
  const ids = new Set<string>();
  views.items.forEach((view, index) => {
    check.view(view, index, offered);
    if (ids.has(view.id)) {
      check.refuse(
        `/views/items/${index}/id`,
        `the view id "${view.id}" is taken`,
      );
    }
    ids.add(view.id);
  });
  if (views.defaultView !== undefined && !ids.has(views.defaultView)) {
    check.refuse(
      "/views/defaultView",
      `defaultView "${views.defaultView}" is not one of the views`,
    );
  }
  const { items, ...rest } = views;
  return { items: items.map(viewOption), ...rest };
}

function summaryOption(entry: FooterSummarySetting): Config {
  return present({
    label: entry.label,
    op: entry.op,
    field: entry.field && entry.op === "sum" ? entry.field : undefined,
    where: entry.where
      ? { field: entry.where.column, [entry.where.op]: entry.where.value }
      : undefined,
  });
}

interface OfferedDisplays {
  displays: Config[] | undefined;
  offered: Set<string>;
}

interface SettingsPlan {
  patch: Patch;
  issues: ValidationIssue[];
  warnings: OpWarning[];
  flags: Check["flags"];
  summary: boolean;
}

/** The displays the table offers once the settings are written, in the switcher's order. */
function offeredAfter(
  current: Config,
  settings: TableViewSettings,
): OfferedDisplays {
  const listed = Array.isArray(current.displays)
    ? current.displays.filter(isRecord)
    : undefined;
  let displays = listed;
  if (settings.cards) {
    const base = listed ?? [{ id: TABLE }];
    displays = base.some((entry) => entry.id === CARDS)
      ? base
      : [...base, { id: CARDS }];
  } else if (settings.cards === null && listed) {
    displays = listed.filter((entry) => entry.id !== CARDS);
  }
  const kanban =
    settings.kanban === undefined ? current.kanban : settings.kanban;
  const grouped =
    settings.grouped === undefined ? current.grouped : settings.grouped;
  const offered = new Set<string>(displays ? listedIds(displays) : [TABLE]);
  if (kanban) {
    offered.add("kanban");
  }
  if (grouped) {
    offered.add("grouped");
  }
  const onlyTable = displays?.length === 1 && displays[0].id === TABLE;
  return { displays: onlyTable ? undefined : displays, offered };
}

function displayPatch(
  check: Check,
  current: Config,
  settings: TableViewSettings,
): Patch {
  const patch: Patch = {};
  if (settings.kanban !== undefined) {
    if (settings.kanban) {
      check.kanban(settings.kanban.groupBy);
      patch.kanban = present({
        groupByField: settings.kanban.groupBy,
        draggable: settings.kanban.draggable,
      });
    } else {
      patch.kanban = undefined;
    }
  }
  if (settings.grouped !== undefined) {
    if (settings.grouped) {
      const { groupBy, by, collapsible, count } = settings.grouped;
      check.grouped(groupBy, by, count === true);
      patch.grouped = present({
        groupByField: groupBy,
        by,
        collapsible,
        count,
      });
    } else {
      patch.grouped = undefined;
    }
  }
  if (settings.cards?.fields) {
    check.cardFields(settings.cards.fields);
    const card: Config = isRecord(current.card) ? { ...current.card } : {};
    card.fields = settings.cards.fields;
    patch.card = card;
  }
  const { displays, offered } = offeredAfter(current, settings);
  if (settings.cards !== undefined) {
    patch.displays = displays;
  }
  return Object.assign(
    patch,
    defaultDisplayPatch(check, current, settings, offered),
  );
}

function defaultDisplayPatch(
  check: Check,
  current: Config,
  settings: TableViewSettings,
  offered: ReadonlySet<string>,
) {
  const { defaultDisplay } = settings;
  if (defaultDisplay === null) {
    return { defaultDisplay: undefined };
  }
  if (defaultDisplay !== undefined) {
    if (!offered.has(defaultDisplay)) {
      check.refuse(
        "/defaultDisplay",
        `the table does not offer the ${defaultDisplay} display; it offers ${[...offered].join(", ")}`,
      );
    }
    return { defaultDisplay };
  }
  const kept = current.defaultDisplay;
  if (isString(kept) && !offered.has(kept)) {
    check.warnings.push({
      code: "setting_dropped",
      message: `the ${kept} display is no longer offered, so it is no longer the default`,
    });
    return { defaultDisplay: undefined };
  }
  return {};
}

function footerPatch(
  check: Check,
  current: Config,
  settings: TableViewSettings,
) {
  if (settings.footer === undefined) {
    return {};
  }
  if (settings.footer === null) {
    return { footer: undefined };
  }
  const summary = settings.footer.summary;
  if (summary === undefined) {
    return {};
  }
  summary.forEach((entry, index) =>
    check.summary(entry, `/footer/summary/${index}`),
  );
  const { summary: _previous, ...kept } = isRecord(current.footer)
    ? current.footer
    : {};
  const footer: Config =
    summary.length > 0
      ? { ...kept, summary: summary.map(summaryOption) }
      : kept;
  return { footer: Object.keys(footer).length > 0 ? footer : undefined };
}

/** What the settings write to the block's options, or why they are refused. */
function planSettings(
  columns: ReadonlyMap<string, Column>,
  current: Config,
  settings: TableViewSettings,
): SettingsPlan {
  const check = new Check(columns);
  const patch = displayPatch(check, current, settings);
  if (settings.views !== undefined) {
    const offered = offeredAfter(current, settings).offered;
    patch.views =
      settings.views === null
        ? undefined
        : viewsOption(check, settings.views, offered);
  }
  Object.assign(patch, footerPatch(check, current, settings));
  return {
    patch,
    issues: check.issues,
    warnings: check.warnings,
    flags: check.flags,
    summary: (settings.footer?.summary?.length ?? 0) > 0,
  };
}

function targetBlock(
  ref: string,
  opts: ConfigureTableViewOpts | undefined,
): BlockNode | OpResult<never> {
  const structure = buildPageStructure(ref);
  if (!structure.ok) {
    return structure;
  }
  const tables = findTableViews(structure.data.blocks);
  const named = opts?.block
    ? tables.filter((block) => block.name === opts.block)
    : tables;
  if (named.length !== 1) {
    return invalidConfig<never>(
      named.length === 0
        ? `${ref} holds no TableView${opts?.block ? ` named "${opts.block}"` : ""}`
        : `${ref} holds ${named.length} TableViews: name one with \`block\` (${named.map((block) => block.name).join(", ")})`,
    );
  }
  return named[0];
}

/** Marks the columns the settings filter or sort on, which the builder wrote the controller to allow. */
function markFlags(
  controller: string,
  flags: Check["flags"],
): OpResult<undefined> | undefined {
  const changes: FileChange[] = [];
  for (const flag of ["filterable", "sortable"] as const) {
    for (const name of flags[flag]) {
      const marked = configureField(`${controller}#${name}`, {
        [flag]: true,
      });
      if (!marked.ok) {
        return marked;
      }
      changes.push(...marked.changes);
    }
  }
  return changes.length > 0
    ? { ok: true, data: undefined, changes }
    : undefined;
}

/** The controller's edits the settings call for: the flags they use, and the summary route a figure reads. */
function prepareController(
  controller: string,
  planned: ReturnType<typeof planSettings>,
): OpResult<undefined> {
  const flagged = markFlags(controller, planned.flags);
  if (flagged && !flagged.ok) {
    return flagged;
  }
  const mounted = planned.summary ? mountSummaryRoute(controller) : undefined;
  if (mounted && !mounted.ok) {
    return mounted;
  }
  return {
    ok: true,
    data: undefined,
    changes: [...(flagged?.changes ?? []), ...(mounted?.changes ?? [])],
  };
}

/**
 * Sets displays, views and footer figures on a page's TableView, after checking each choice
 * against the table's columns. The block is rewritten by `configureBlock`, so the page is
 * typechecked before anything is written; a footer figure first mounts the controller's summary
 * route, and that stays when the block's own rewrite is then refused.
 */
export function configureTableView(
  ref: string,
  settings: TableViewSettings,
  opts?: ConfigureTableViewOpts,
): OpResult<{ path: BlockPath }> {
  const block = targetBlock(ref, opts);
  if ("ok" in block) {
    return block;
  }
  if (!block.editable || !block.controller) {
    return unsupported<{ path: BlockPath }>(
      `the TableView ${block.name} is not editable or reads no known resource`,
    );
  }
  const resource = buildResourceStructure(block.controller);
  if (!resource.ok) {
    return resource;
  }
  const columns = new Map(
    resource.data.fields.map((field) => [field.name, columnOf(field)]),
  );
  const planned = planSettings(columns, block.config ?? {}, settings);
  if (planned.issues.length > 0) {
    return {
      ok: false,
      error: { code: "invalid_config", issues: planned.issues },
    };
  }
  const prepared = prepareController(block.controller, planned);
  if (!prepared.ok) {
    return prepared;
  }
  const written =
    Object.keys(planned.patch).length === 0
      ? { ok: true as const, data: undefined, changes: [] }
      : configureBlock(block.path, planned.patch, {
          expectedVersion: opts?.expectedVersion,
        });
  if (!written.ok) {
    return written;
  }
  const warnings = [...planned.warnings, ...(written.warnings ?? [])];
  const result: OpResult<{ path: BlockPath }> = {
    ok: true,
    data: { path: block.path },
    changes: [...prepared.changes, ...written.changes],
  };
  if (warnings.length > 0) {
    result.warnings = warnings;
  }
  return result;
}
