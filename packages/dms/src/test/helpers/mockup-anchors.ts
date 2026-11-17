import type { JsonValue } from "@antelopejs/interface-dms/json";
import { expect } from "chai";
import {
  createAnnotation,
  defaultMockupsDir,
  listAnnotations,
  type MockupAnnotation,
  mockupNameSchema,
} from "../../mockup";
import {
  answer,
  mockupTool,
  NAME,
  spec,
  writeAnswerSchema,
} from "./mockup-mcp";

/** The mockup the anchor tests annotate: the one `useWorkspace` clears. */
export const MOCKUP = mockupNameSchema.parse(NAME);

/** The id format anchoring stamps on a block that has none. */
export const STAMPED_ID = /^b-[a-z0-9]{8}$/;

const write = mockupTool("mockup_write_spec");
const patch = mockupTool("mockup_patch_spec");

export function block(html: string, id: string): JsonValue {
  return { type: "sketch", options: { html, height: 120 }, id };
}

export function kpi(title: string): JsonValue {
  return { type: "KpiCard", options: { title } };
}

/** A `ChartCard` with no id, whose chart child has the id `chart`. */
export function chartCard(title: string): JsonValue {
  return {
    type: "ChartCard",
    options: { title },
    children: [{ id: "chart", type: "ChartArea" }],
  };
}

/** A `KpiCard` whose author wrote the id `header`. */
export function header(title: string): JsonValue {
  return { id: "header", type: "KpiCard", options: { title } };
}

/** A row with the author id `header`, holding a `KpiCard` with the author id `title`. */
export function headerRow(title: string): JsonValue {
  return {
    id: "header",
    type: "GridRow",
    children: [{ id: "title", type: "KpiCard", options: { title } }],
  };
}

async function writeSpec(value: JsonValue): Promise<void> {
  const written = await answer(
    write,
    { mockup: NAME, spec: value },
    writeAnswerSchema,
  );
  expect(written.errors).to.deep.equal([]);
}

/** Writes a one-page spec whose page `home` holds `tree`. */
export function put(...tree: JsonValue[]): Promise<void> {
  return writeSpec(spec(...tree));
}

/** Writes a spec whose page `page-<index>` holds the tree at that index. */
export function putPages(...trees: JsonValue[][]): Promise<void> {
  const pages = trees.map((tree, index) => ({
    id: `page-${index}`,
    title: `Page ${index}`,
    tree,
  }));
  return writeSpec({ version: 1, pages });
}

/** Applies `operations` with `mockup_patch_spec`, expecting no error. */
export async function edit(...operations: JsonValue[]): Promise<void> {
  const patched = await answer(
    patch,
    { mockup: NAME, patch: operations },
    writeAnswerSchema,
  );
  expect(patched.errors).to.deep.equal([]);
}

export function patchAnswer(...operations: JsonValue[]) {
  return answer(patch, { mockup: NAME, patch: operations }, writeAnswerSchema);
}

/** Creates a note on the node at `path` of page `page`, and answers it as created. */
export async function annotate(
  page: string,
  path: string,
  text = "note",
): Promise<MockupAnnotation> {
  const created = await createAnnotation(
    MOCKUP,
    { page, path, text },
    defaultMockupsDir(),
  );
  if (created.kind !== "created") {
    throw new Error(`not created: ${created.kind}`);
  }
  return created.annotation;
}

export async function served(id: string): Promise<MockupAnnotation> {
  const note = (await listAnnotations(MOCKUP, defaultMockupsDir()))?.find(
    (candidate) => candidate.id === id,
  );
  if (!note) throw new Error(`no annotation ${id}`);
  return note;
}

/** Expects the note `id` served at `path`, on a block whose option `option` is `value`. */
export async function expectBlockAt(
  id: string,
  path: string,
  option: string,
  value: string,
): Promise<void> {
  expect((await served(id)).path).to.equal(path);
  await edit({ op: "test", path: `${path}/options/${option}`, value });
}

/** Expects the note `id` served with no location. */
export async function expectNoLocation(id: string): Promise<void> {
  const note = await served(id);
  expect(note).to.include({ id });
  expect(note).to.not.have.property("page");
  expect(note).to.not.have.property("path");
}
