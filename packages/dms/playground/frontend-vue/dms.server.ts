import {
  answerDocsFixture,
  DOCS_FIXTURES_PREFIX,
} from "./server/docs-fixtures/answer";
import type { FixtureValue } from "./server/docs-fixtures/helio";

/** What a route of the frontend server receives, as far as these routes read it. */
interface FixtureEvent {
  request: Request;
  url: { pathname: string; searchParams: URLSearchParams };
  readJson(): Promise<FixtureValue>;
}

/** The part of `#dms/server`'s `DmsServer` these routes use. */
interface FixtureServer {
  registerRoute(
    method: readonly string[],
    path: string,
    handler: (event: FixtureEvent) => Promise<Response>,
  ): void;
  registerRouteRules(rules: Readonly<Record<string, { ssr?: false }>>): void;
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const PATTERNS = [":set", ":set/:action", ":set/:action/:id"];

async function answer(event: FixtureEvent): Promise<Response> {
  const method = event.request.method.toUpperCase();
  const fixture = answerDocsFixture({
    method,
    path: event.url.pathname.slice(DOCS_FIXTURES_PREFIX.length),
    query: event.url.searchParams,
    body: method === "GET" ? undefined : await event.readJson(),
  });
  return Response.json(fixture.body, { status: fixture.status });
}

/**
 * The playground's frontend server entry: it answers the documentation
 * examples' routes (`/docs-fixtures/…`) with Helio's rows, so a table or a
 * form in an example has data without a backend route. The block preview
 * renders in the browser, whose requests reach these routes; a server render
 * would send them to the backend.
 */
export default function docsFixturesServer(server: FixtureServer): void {
  server.registerRouteRules({ "/dms-preview": { ssr: false } });
  for (const pattern of PATTERNS) {
    server.registerRoute(METHODS, `${DOCS_FIXTURES_PREFIX}${pattern}`, answer);
  }
}
