import {
  type CallExpression,
  type ClassDeclaration,
  type Expression,
  Node,
  type ObjectLiteralExpression,
} from "ts-morph";
import { isControllerLeadingBlock } from "./catalog";
import { type ChainInfo, resolveAndUnwrap } from "./chain";
import { stringLiteralValue } from "./literals";

export interface BlockTarget {
  factoryCall: CallExpression;
  childCalls: CallExpression[];
  chainExpr: Expression;
  childCall?: CallExpression;
  optionsObj?: ObjectLiteralExpression;
  editable: boolean;
  /** Options object is the second argument (after a leading controller class). */
  controllerArg: boolean;
}

export type TargetResult =
  | { ok: true; target: BlockTarget }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "opaque"; detail: string };

function staticInitializer(
  cls: ClassDeclaration,
  name: string,
): Expression | undefined {
  for (const prop of cls.getStaticProperties()) {
    if (Node.isPropertyDeclaration(prop) && prop.getName() === name) {
      return prop.getInitializer();
    }
  }
  return undefined;
}

function childCallById(
  chain: ChainInfo,
  id: string,
): CallExpression | undefined {
  return chain.childCalls.find(
    (call) => stringLiteralValue(call.getArguments()[0]) === id,
  );
}

interface UnwrappedBlock {
  ok: true;
  chain: ChainInfo;
  factoryCall: CallExpression;
  chainExpr: Expression;
}

function unwrapBlock(
  expr: Expression,
): UnwrappedBlock | Extract<TargetResult, { reason: "opaque" }> {
  const unwrapped = resolveAndUnwrap(expr);
  const { chain, rootExpr } = unwrapped;
  if (unwrapped.opaqueReason || !chain?.factoryCall || !rootExpr) {
    return {
      ok: false,
      reason: "opaque",
      detail: unwrapped.opaqueReason ?? "",
    };
  }
  return {
    ok: true,
    chain,
    factoryCall: chain.factoryCall,
    chainExpr: rootExpr,
  };
}

function toTarget(
  { chain, factoryCall, chainExpr }: UnwrappedBlock,
  childCall?: CallExpression,
): BlockTarget {
  const controllerArg = chain.factory
    ? isControllerLeadingBlock(chain.factory)
    : false;
  const optionsArg = factoryCall.getArguments()[controllerArg ? 1 : 0];
  const optionsObj =
    optionsArg && Node.isObjectLiteralExpression(optionsArg)
      ? optionsArg
      : undefined;
  return {
    factoryCall,
    childCalls: chain.childCalls,
    chainExpr,
    childCall,
    optionsObj,
    editable: !optionsArg || optionsObj !== undefined,
    controllerArg,
  };
}

export function resolveBlockTarget(
  cls: ClassDeclaration,
  segments: string[],
): TargetResult {
  const [head, ...rest] = segments;
  const init = staticInitializer(cls, head);
  if (!init) {
    return { ok: false, reason: "not_found" };
  }
  let current = unwrapBlock(init);
  if (!current.ok) {
    return current;
  }
  let childCall: CallExpression | undefined;
  for (const segment of rest) {
    childCall = childCallById(current.chain, segment);
    const childExpr = childCall?.getArguments()[1];
    if (!childCall || !childExpr || !Node.isExpression(childExpr)) {
      return { ok: false, reason: "not_found" };
    }
    const next = unwrapBlock(childExpr);
    if (!next.ok) {
      return next;
    }
    current = next;
  }
  return { ok: true, target: toTarget(current, childCall) };
}
