import { describe, expect, it } from "vitest";
import { fixturesOnlyPolicy } from "../layers/dms-ui/app/build/utils/previewFixturesOnly";

const LOCATION = {
  origin: "http://localhost:3001",
  host: "localhost:3001",
  protocol: "http:",
};

/** The sources of one directive of `policy`. */
function sourcesOf(policy: string, directive: string): string[] {
  const entry = policy
    .split(";")
    .map((part) => part.trim().split(/\s+/))
    .find(([name]) => name === directive);
  return entry ? entry.slice(1) : [];
}

/** Whether a CSP source list admits `url`, as a browser matches a scheme, a host or a path prefix. */
function admits(sources: readonly string[], url: string): boolean {
  const target = new URL(url);
  return sources.some((source) => {
    if (source === "*" || source === "'self'") return true;
    if (source.endsWith(":") && !source.includes("/"))
      return target.protocol === source;
    const allowed = new URL(source);
    if (allowed.origin !== target.origin) return false;
    return allowed.pathname.endsWith("/")
      ? target.pathname.startsWith(allowed.pathname)
      : target.pathname === allowed.pathname;
  });
}

const LIVE = [
  "http://localhost:3001/api/dashboard/kpi/revenue",
  "http://localhost:3001/api/files/metadata?resourceKey=k",
  "http://localhost:3001/api/user/list",
  "http://localhost:3001/avatar.png",
  "https://elsewhere.test/api/mockup/demo/pages/p/fixtures/k",
];

describe("a preview drawn on fixtures", () => {
  it("lets no image, media or connection reach a route outside the mockup's own", () => {
    const policy = fixturesOnlyPolicy(LOCATION);
    for (const directive of ["img-src", "media-src", "connect-src"]) {
      const sources = sourcesOf(policy, directive);
      expect(sources.length, directive).toBeGreaterThan(0);
      for (const url of LIVE)
        expect(admits(sources, url), `${directive} ${url}`).toBe(false);
    }
  });

  it("still reads the mockup's fixtures, its realtime session and its assets", () => {
    const policy = fixturesOnlyPolicy(LOCATION);
    expect(
      admits(
        sourcesOf(policy, "connect-src"),
        "http://localhost:3001/api/mockup/demo/pages/p/fixtures/k/rows?offset=0",
      ),
    ).toBe(true);
    expect(
      admits(
        sourcesOf(policy, "connect-src"),
        "http://localhost:3001/api/realtime/session",
      ),
    ).toBe(true);
    expect(
      admits(
        sourcesOf(policy, "img-src"),
        "http://localhost:3001/_nuxt/logo.svg",
      ),
    ).toBe(true);
    expect(
      admits(sourcesOf(policy, "img-src"), "data:image/png;base64,AA=="),
    ).toBe(true);
  });

  it("refuses frames and plugins outright", () => {
    const policy = fixturesOnlyPolicy(LOCATION);
    expect(sourcesOf(policy, "frame-src")).toEqual(["'none'"]);
    expect(sourcesOf(policy, "object-src")).toEqual(["'none'"]);
  });
});
