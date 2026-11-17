import type {
  BlockNode,
  ConfigObject,
} from "@antelopejs/interface-dms-builder";
import { type Expression, Node, SyntaxKind } from "ts-morph";
import { isControllerLeadingBlock } from "./catalog";
import { resolveAndUnwrap } from "./chain";
import { propertyName } from "./config-literal";
import { unwrapExpression } from "./expression";
import { type EmitContext, serializeValue } from "./value";

/** Replace understood spans, leaving all other bytes owned by the source. */
export function patchSourceOptions(
  expr: Expression,
  source: BlockNode,
  config: ConfigObject,
  children: { expression: Expression; text: string }[],
  ctx: EmitContext,
): string {
  const { chain } = resolveAndUnwrap(expr);
  const arg =
    chain!.factoryCall!.getArguments()[
      isControllerLeadingBlock(chain!.factory!) ? 1 : 0
    ];
  const object = unwrapExpression(arg);
  if (!Node.isObjectLiteralExpression(object))
    throw new Error("Expected editable options");
  const remaining = new Set(Object.keys(config));
  const edits: { start: number; end: number; text: string }[] = [];
  for (const prop of object.getProperties()) {
    if (
      !Node.isPropertyAssignment(prop) &&
      !Node.isShorthandPropertyAssignment(prop)
    )
      continue;
    const key = propertyName(prop);
    if (Object.hasOwn(source.lockedOptions!, key)) continue;
    remaining.delete(key);
    if (!Object.hasOwn(config, key)) {
      const comma = prop.getNextSiblingIfKind(SyntaxKind.CommaToken);
      edits.push({
        start: prop.getStart(),
        end: comma?.getEnd() ?? prop.getEnd(),
        text: "",
      });
    } else {
      edits.push({
        start: prop.getStart(),
        end: prop.getEnd(),
        text: `${JSON.stringify(key)}: ${serializeValue(config[key], ctx)}`,
      });
    }
  }
  if (remaining.size) {
    edits.push({
      start: object.getStart() + 1,
      end: object.getStart() + 1,
      text: `${[...remaining].map((key) => `${JSON.stringify(key)}: ${serializeValue(config[key], ctx)}`).join(",")},`,
    });
  }
  for (const child of children) {
    edits.push({
      start: child.expression.getStart(),
      end: child.expression.getEnd(),
      text: child.text,
    });
  }
  let text = expr.getText();
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    text =
      text.slice(0, edit.start - expr.getStart()) +
      edit.text +
      text.slice(edit.end - expr.getStart());
  }
  return text;
}
