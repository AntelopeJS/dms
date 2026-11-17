import type { BlockNode } from "@antelopejs/interface-dms-builder";
import {
  type CallExpression,
  type ClassDeclaration,
  type Expression,
  Node,
} from "ts-morph";
import { isControllerLeadingBlock } from "./catalog";
import {
  type ChainInfo,
  isUnknownBlock,
  resolveExpr,
  unwrapBuilderChain,
} from "./chain";
import { editableOptions, objectLiteralToValue } from "./config-literal";
import { unwrapExpression } from "./expression";
import { isString } from "./scalar-guards";
import { stringLiteralValue } from "./literals";
import { findResourceBySymbol } from "./resource-index";
import type { PageRecord } from "./scan";

function buildOpaque(
  path: string,
  name: string,
  reason: string,
  slot?: string,
  meta?: BlockNode["meta"],
): BlockNode {
  return {
    path,
    name,
    type: null,
    editable: false,
    opaqueReason: reason,
    slot,
    meta,
  };
}

/** The `.child()` third argument, split into its `slot` and the rest. */
function readChildMeta(metaArg: Node | undefined): BlockNodeMeta {
  if (metaArg) metaArg = unwrapExpression(metaArg);
  if (!metaArg || !Node.isObjectLiteralExpression(metaArg)) {
    return {};
  }
  const read = objectLiteralToValue(metaArg);
  if (!read.fullyLiteral) return {};
  const { slot, ...rest } = read.value;
  return {
    slot: isString(slot) ? slot : undefined,
    meta: Object.keys(rest).length > 0 ? rest : undefined,
  };
}

function buildChildNode(
  childCall: CallExpression,
  parentPath: string,
  ownerClass: ClassDeclaration,
): BlockNode | undefined {
  const [idArg, valueArg, metaArg] = childCall.getArguments();
  const id = stringLiteralValue(idArg);
  if (!id || !valueArg || !Node.isExpression(valueArg)) {
    return undefined;
  }
  const childMeta = readChildMeta(metaArg);
  return buildBlockNode(
    id,
    valueArg,
    `${parentPath}/${id}`,
    ownerClass,
    childMeta,
  );
}

interface BlockNodeMeta {
  slot?: string;
  meta?: BlockNode["meta"];
}

function structureLockReason(
  expr: Expression,
  chain: ChainInfo,
  children: BlockNode[],
  partial: boolean,
): string | undefined {
  if (chain.opaqueReason) return chain.opaqueReason;
  if (Node.isIdentifier(unwrapExpression(expr)))
    return "Shared block reference: edit it in code";
  if (
    chain.factoryCall!.getArguments().length >
    (isControllerLeadingBlock(chain.factory!) ? 2 : 1)
  )
    return "Additional factory arguments require editing in code";
  const unsafeChildren = chain.childCalls.some((call) => {
    const args = call.getArguments();
    return (
      args.length > 3 ||
      (args[2] && !objectLiteralToValue(args[2]).fullyLiteral)
    );
  });
  if (
    unsafeChildren ||
    (children.length !== chain.childCalls.length && !partial)
  )
    return "Child declarations or placement require editing in code";
  return undefined;
}

function buildBlockNode(
  name: string,
  expr: Expression,
  path: string,
  ownerClass: ClassDeclaration,
  nodeMeta: BlockNodeMeta = {},
): BlockNode | undefined {
  const { slot, meta } = nodeMeta;
  const resolved = resolveExpr(expr);
  if (resolved.opaqueReason || !resolved.expr) {
    return buildOpaque(
      path,
      name,
      resolved.opaqueReason ?? "unresolved",
      slot,
      meta,
    );
  }
  const chain = unwrapBuilderChain(resolved.expr);
  if (!chain.factory || !chain.factoryCall) {
    return isUnknownBlock(resolved.expr)
      ? buildOpaque(
          path,
          name,
          "Block the builder has no factory for: edit it in code",
          slot,
          meta,
        )
      : undefined;
  }
  const children = chain.childCalls
    .map((call) => buildChildNode(call, path, ownerClass))
    .filter((child): child is BlockNode => child !== undefined);
  const controllerLeading = isControllerLeadingBlock(chain.factory);
  const args = chain.factoryCall.getArguments();
  let controller: string | undefined;
  if (controllerLeading) {
    const controllerArg = args[0];
    if (controllerArg && Node.isIdentifier(controllerArg)) {
      controller = findResourceBySymbol(controllerArg.getText())?.ref;
    }
  }
  const optionsArg = controllerLeading ? args[1] : args[0];
  const { config, lockedOptions, reason } = editableOptions(optionsArg);
  const opaqueReason =
    structureLockReason(
      expr,
      chain,
      children,
      Object.keys(lockedOptions).length > 0,
    ) ?? reason;
  const editable = !opaqueReason;
  return {
    path,
    name,
    type: chain.factory,
    editable,
    slot,
    meta,
    opaqueReason,
    config: editable ? config : undefined,
    lockedOptions: Object.keys(lockedOptions).length
      ? lockedOptions
      : undefined,
    controller,
    children: children.length > 0 ? children : undefined,
  };
}

export function buildPageBlocks(page: PageRecord): BlockNode[] {
  const blocks: BlockNode[] = [];
  for (const prop of page.classNode.getStaticProperties()) {
    if (!Node.isPropertyDeclaration(prop)) {
      continue;
    }
    const name = prop.getName();
    if (name.startsWith("_")) {
      continue;
    }
    const init = prop.getInitializer();
    if (!init) {
      continue;
    }
    const node = buildBlockNode(
      name,
      init,
      `${page.ref}#${name}`,
      page.classNode,
    );
    if (node) {
      blocks.push(node);
    }
  }
  return blocks;
}
