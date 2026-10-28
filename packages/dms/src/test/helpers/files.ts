import { readFileSync } from "node:fs";

export function readText(
  path: string,
  encoding: BufferEncoding = "utf8",
): string {
  return readFileSync(path, encoding);
}
