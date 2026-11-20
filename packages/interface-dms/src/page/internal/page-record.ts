import { Logging } from "@antelopejs/interface-core/logging";
import type {
  PageHeaderButtonDeclared,
  PageRecordStatus,
} from "../../component-options/internal/page-layout";
import type { ComponentFilterContext, ComponentInfo } from "../../component";
import {
  isFunction,
  isNumber,
  isPlainObject,
  isString,
} from "../../utils/internal/type-check";

const RECORD_TOKEN = /\{\{\s*record\.([\w.-]+)\s*\}\}/g;
const NAMES_RECORD = /\{\{\s*record\./;
const PATH_SEPARATOR = ".";
const URL_OPTION = /(?:url|^to|^href)$/i;
const ROOT_KEY = "";

type DeclaredTarget = NonNullable<PageHeaderButtonDeclared["target"]>;
type DeclaredComponent = Extract<
  DeclaredTarget,
  { component: unknown }
>["component"];

const targetUrl = (
  target: (DeclaredTarget & { url?: unknown }) | undefined,
): string | undefined => {
  const url = target?.url;
  return isString(url) ? url : undefined;
};

const targetRedirect = (target: DeclaredTarget | undefined) =>
  target?.type === "api" ? target.redirect : undefined;

const targetComponent = (target: DeclaredTarget | undefined) =>
  target && "component" in target ? target.component : undefined;

const namesRecord = (component: DeclaredComponent | undefined): boolean =>
  NAMES_RECORD.test(JSON.stringify(component) ?? "");

const isRecordNode = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object";

function leafAt(
  record: NonNullable<PageRecordRead["record"]>,
  path: string,
): string | number | undefined {
  const value = path
    .split(PATH_SEPARATOR)
    .reduce<unknown>(
      (current, key) => (isRecordNode(current) ? current[key] : undefined),
      record,
    );
  return isString(value) || isNumber(value) ? value : undefined;
}

export type { PageRecordStatus } from "../../component-options/internal/page-layout";

/** What reading the page's record answered. */
export interface PageRecordRead {
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- The record the page's loader read (the published PageRecordLoader and ComponentFilterContext.record), keyed by that page's data and read by the {{record.X}} paths its author writes.
  record?: Readonly<Record<string, unknown>>;
  status: PageRecordStatus;
}

/**
 * The record the page's layout reads for one request, `undefined` when the
 * layout declares none. A loader that throws counts as finding none, with
 * the `error` status: the buttons acting on the record are left out, and the
 * page still loads.
 *
 * @internal
 */
export async function readPageRecord(
  layout: ComponentInfo | undefined,
  context: ComponentFilterContext,
): Promise<PageRecordRead | undefined> {
  const options = layout?.options;
  const loader = isRecordNode(options) ? options.record : undefined;
  if (!isFunction(loader)) return undefined;
  try {
    const record: unknown = await loader(context);
    return isRecordNode(record)
      ? { record, status: "found" }
      : { status: "missing" };
  } catch (error) {
    Logging.Error("[dms] the record of the page could not be read:", error);
    return { status: "error" };
  }
}

/** Whether a header button acts on the page's record. */
function isRecordBound(button: PageHeaderButtonDeclared): boolean {
  if (button.requiresRecord) return true;
  if (namesRecord(targetComponent(button.target))) return true;
  return [targetUrl(button.target), targetRedirect(button.target)].some(
    (url) => !!url && NAMES_RECORD.test(url),
  );
}

const keepRaw = (value: string): string => value;

/**
 * A text with its `{{record.X}}` tokens filled in, each value written by
 * `encode`: percent-encoded in a URL (an address is one query value). A token
 * the record has no value for is left as written.
 */
function fillRecordTokens(
  text: string,
  record: NonNullable<PageRecordRead["record"]>,
  encode: (value: string) => string = encodeURIComponent,
): string {
  return text.replace(RECORD_TOKEN, (match, path: string) => {
    const value = leafAt(record, path);
    return value === undefined ? match : encode(String(value));
  });
}

type OptionsNode = DeclaredComponent["options"];

const isList = (value: OptionsNode): value is OptionsNode[] =>
  Array.isArray(value);

/**
 * The options of a component a target opens with the `{{record.X}}` tokens of
 * every string in them filled in, down their lists and object literals:
 * percent-encoded under a key ending in `url`, or named `to` or `href`, raw
 * under any other. Any other value is left as it is.
 */
function fillRecordOptions(
  node: OptionsNode,
  key: string,
  record: NonNullable<PageRecordRead["record"]>,
): OptionsNode {
  if (isString(node)) {
    const encode = URL_OPTION.test(key) ? encodeURIComponent : keepRaw;
    return fillRecordTokens(node, record, encode);
  }
  if (isList(node)) {
    return node.map((item) => fillRecordOptions(item, key, record));
  }
  if (!isPlainObject(node)) return node;
  return Object.fromEntries(
    Object.entries(node).map(([name, item]) => [
      name,
      fillRecordOptions(item, name, record),
    ]),
  );
}

function fillRecordComponent(
  component: DeclaredComponent,
  record: NonNullable<PageRecordRead["record"]>,
): DeclaredComponent {
  return {
    ...component,
    options: fillRecordOptions(component.options, ROOT_KEY, record),
    children: component.children?.map((child) => ({
      ...child,
      component: fillRecordComponent(child.component, record),
    })),
  };
}

/**
 * A header button as the page's record leaves it: unchanged when the layout
 * reads no record or the button does not act on it, left out (`undefined`)
 * when the record was not found, the `{{record.X}}` of its target's `url`
 * (and of an `api` target's `redirect`), or of the options of the component a
 * drawer, modal or side panel opens, filled in otherwise.
 *
 * @internal
 */
export function withPageRecord(
  button: PageHeaderButtonDeclared,
  declaresRecord: boolean,
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- The record the page's loader read (the published PageRecordLoader and ComponentFilterContext.record), keyed by that page's data and read by the {{record.X}} paths its author writes.
  record: Readonly<Record<string, unknown>> | undefined,
): PageHeaderButtonDeclared | undefined {
  if (!declaresRecord || !isRecordBound(button)) return button;
  if (!record) return undefined;
  const { target } = button;
  if (target && "component" in target) {
    const component = fillRecordComponent(target.component, record);
    return { ...button, target: { ...target, component } };
  }
  if (!target || !("url" in target) || !isString(target.url)) return button;
  const filled = { ...target, url: fillRecordTokens(target.url, record) };
  if (filled.type === "api" && filled.redirect !== undefined) {
    filled.redirect = fillRecordTokens(filled.redirect, record);
  }
  return { ...button, target: filled };
}
