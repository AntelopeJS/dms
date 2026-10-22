import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const LAYERS_DIR = path.resolve(__dirname, "../layers");
// A static attribute reads the same in every language: these take a
// translated binding instead (`:aria-label="t('…')"`).
const LITERAL_LABEL = /\s(?:aria-label|title)="[A-Za-z][^"{]*"/g;

function vueFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "node_modules" || entry.name.startsWith(".")
        ? []
        : vueFiles(full);
    }
    return entry.name.endsWith(".vue") ? [full] : [];
  });
}

describe("translated accessible names", () => {
  it("keeps literal text out of aria-label and title attributes", () => {
    const literals = vueFiles(LAYERS_DIR).flatMap((file) =>
      [...readFileSync(file, "utf-8").matchAll(LITERAL_LABEL)].map(
        (match) => `${path.relative(LAYERS_DIR, file)}:${match[0].trim()}`,
      ),
    );
    expect(literals).toEqual([]);
  });
});
