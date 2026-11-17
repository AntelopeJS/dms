import fc from "fast-check";
import { runProperties, rule, type PropertyCheck } from "../../formal/run-properties.cjs";
import { MAX_RELATIVE_ROUTE, RELATIVE_ROUTE_PATTERN, liveRouteSchema, relativeRouteSchema } from "../../../packages/dms/src/mockup/model";

import { isDashboardPath } from "../../../packages/dms/frontend-vue/layers/dms-ui/app/build/utils/mockup";
import { resolveUrlVariables } from "../../../packages/dms/frontend-vue/layers/dms-ui/app/build/utils/urlVariables";

/** Characters on which two route rules differ in one engine or another: separators, controls, Unicode spaces, braces. */
const EDGE_CHARACTERS = [
  "/", "\\", "a", "b", "0", "-", ".", "_", "~", "%", "?", "#", "&", "=", "@", ":", "^", "{", "}", "{{", "}}",
  " ", "\t", "\n", "\r", "\v", "\f", "\u0000", "\u0005", "\u007f", "\u0085", "\u009f",
  " ", " ", " ", " ", " ", " ", " ", "　", "﻿", "​", "᠎",
] as const;

const anyCharacter = fc.oneof(
  { weight: 6, arbitrary: fc.constantFrom(...EDGE_CHARACTERS) },
  { weight: 2, arbitrary: fc.string({ unit: "binary", minLength: 1, maxLength: 1 }) },
);

/** The padding the live-route rule documents: plain spaces. */
const SPACES = ["", " ", "  "] as const;
/** The padding the dashboard's `\s*` also reads: tabs, newlines and Unicode spaces. */
const NON_SPACES = ["\t", "\n", " ", " ", "　", "﻿"] as const;
const TOKEN_KEYS = ["params.id", "params.id:3", "query.page", "query.a-b.c", "response.user.name", "params.", "params.a b", "query", "x"] as const;

/** A `{{ key }}` token with the given paddings and a key from the dashboard's kinds or near them. */
function tokenPadded(paddings: readonly string[]): fc.Arbitrary<string> {
  const padding = fc.constantFrom(...paddings);
  return fc.tuple(padding, fc.constantFrom(...TOKEN_KEYS), padding).map(([before, key, after]) => `{{${before}${key}${after}}}`);
}

/** A string that starts like a route nine times in ten: characters, tokens padded as given, and runs of both. */
function candidateOf(paddings: readonly string[]): fc.Arbitrary<string> {
  const body = fc
    .array(fc.oneof({ weight: 3, arbitrary: anyCharacter }, { weight: 1, arbitrary: tokenPadded(paddings) }), { maxLength: 14 })
    .map((parts) => parts.join(""));
  return fc.oneof({ weight: 9, arbitrary: body.map((text) => `/${text}`) }, { weight: 1, arbitrary: body });
}

const anyPadding = [...SPACES, ...NON_SPACES];

/** A character a live route allows in a path outside a token. */
const pathCharacter = fc.constantFrom("a", "b", "0", "-", ".", "_", "~", "%", "?", "#", "&", "=", "@", ":", "^", "/", "{", "}");

const resolvableToken = fc
  .tuple(
    fc.constantFrom(...SPACES),
    fc.constantFrom("params.id", "params.id:3", "query.page", "query.a-b.c"),
    fc.constantFrom(...SPACES),
  )
  .map(([before, key, after]) => `{{${before}${key}${after}}}`);

/** A live route as a spec holds it: a slash, then path characters and tokens the dashboard resolves, padded with plain spaces. */
const liveRoute = fc
  .array(fc.oneof({ weight: 3, arbitrary: pathCharacter }, { weight: 1, arbitrary: resolvableToken }), { maxLength: 12 })
  .map((parts) => `/${parts.join("")}`.replace(/^\/[/\\]+/, "/"));

/** A value a page carries for a route token: any text, since the dashboard encodes it. */
const routeValue = fc.oneof(
  fc.string({ unit: "binary", minLength: 1, maxLength: 8 }),
  fc.constantFrom(" ", "/", "\\", "//evil.example", "\t", "\u0000", "{{ params.id }}", "%2F", "%E0%A4%A", "a b"),
);
const routeValues = fc.record({ id: routeValue, id3: routeValue, page: routeValue, ab: routeValue });

/** What a page carries for each route token the dashboard resolves, with plain values. */
const PLAIN_VALUES = { routeParams: { id: "1", "id:3": "1" }, routeQuery: { page: "1", "a-b.c": "1" } } as const;

/** Whether a route that resolves to a path of the dashboard is a live route. */
function resolvedRouteIsLive(route: string): boolean {
  const resolved = resolveUrlVariables(route, PLAIN_VALUES);
  return resolved === undefined || !isDashboardPath(resolved) || liveRouteSchema.safeParse(route).success;
}

const rules: readonly PropertyCheck[] = [
  rule(
    "BackendAndVueAgree",
    fc.property(candidateOf(anyPadding), (text) => RELATIVE_ROUTE_PATTERN.test(text) === isDashboardPath(text)),
  ),
  rule(
    "BuiltPathRuleIsPatternAndLength",
    fc.property(candidateOf(anyPadding), fc.nat(MAX_RELATIVE_ROUTE + 4), (text, extra) => {
      const longer = text + "a".repeat(extra);
      return relativeRouteSchema.safeParse(longer).success === (longer.length <= MAX_RELATIVE_ROUTE && isDashboardPath(longer));
    }),
  ),
  rule(
    "LiveRouteResolvesToBuiltPath",
    fc.property(liveRoute, routeValues, (route, values) => {
      if (!liveRouteSchema.safeParse(route).success) return false;
      const resolved = resolveUrlVariables(route, {
        routeParams: { id: values.id, "id:3": values.id3 },
        routeQuery: { page: values.page, "a-b.c": values.ab },
      });
      return resolved === undefined || isDashboardPath(resolved);
    }),
  ),
  rule("ResolvedRouteIsALiveRoute", fc.property(candidateOf(SPACES), resolvedRouteIsLive)),
  rule("ResolvedPaddedRouteIsALiveRoute", fc.property(candidateOf(anyPadding), resolvedRouteIsLive)),
];

/** The rules that break on the code today. */
const FINDINGS: ReadonlySet<string> = new Set(["ResolvedPaddedRouteIsALiveRoute"]);

runProperties(rules, FINDINGS, process.argv.slice(2));
