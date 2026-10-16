import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

// A module route owns its path for every method: one on a page's path makes
// the page unreachable (the invite link `GET /auth/signup` answered 405).
const serverEntry = readFileSync(join(__dirname, "../dms.server.ts"), "utf8");
const routePaths = [
  ...serverEntry.matchAll(/registerRoute\(\s*"[A-Z]+",\s*"([^"]+)"/g),
].map((match) => match[1]);

function pageSlugs(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return pageSlugs(path);
    const slug = /urlSlug:\s*"([^"]+)"/.exec(readFileSync(path, "utf8"));
    return slug ? [`/${slug[1]}`] : [];
  });
}

it("serves no module route on the path of a public page", () => {
  const pages = pageSlugs(join(__dirname, "../../src/pages/public"));
  expect(routePaths.length).toBeGreaterThan(0);
  expect(pages).toContain("/auth/signup");
  expect(routePaths.filter((path) => pages.includes(path))).toEqual([]);
});
