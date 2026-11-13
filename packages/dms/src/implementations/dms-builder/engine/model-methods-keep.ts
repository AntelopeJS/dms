/**
 * Keeping the query methods of a model through a rewrite of its file.
 *
 * Mapping a relation again writes the table, model and controller from the
 * database's description. The query methods the builder added to the model since
 * belong to pages, not to the description, so they are carried over: dropping
 * them would leave every page route that calls one pointing at nothing.
 */

import type { SourceFile } from "ts-morph";
import { parseModelMethod } from "./query-template";

/** The text of each model method that still parses as a builder query. */
export function generatedModelMethods(
  file: SourceFile,
  modelName: string,
): string[] {
  const modelClass = file.getClass(modelName);
  if (!modelClass) {
    return [];
  }
  return modelClass
    .getMethods()
    .filter((method) => parseModelMethod(method) !== undefined)
    .map((method) => method.getFullText().trim());
}

/** Adds the methods back to the model class of the rewritten file. */
export function restoreModelMethods(
  file: SourceFile,
  modelName: string,
  methods: string[],
): void {
  const modelClass = file.getClass(modelName);
  if (!modelClass) {
    return;
  }
  for (const text of methods) {
    modelClass.addMember(text);
  }
}
