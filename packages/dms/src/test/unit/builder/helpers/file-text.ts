import fs from "node:fs";
import path from "node:path";

/** A file of a fixture project by its absolute path, as text. */
export function fileText(filepath: string): string {
  return fs.readFileSync(filepath, "utf8");
}

/** A file's bytes by its absolute path. */
export function fileBytes(filepath: string): Buffer {
  return fs.readFileSync(filepath);
}

/** Whether a path exists. */
export function pathExists(filepath: string): boolean {
  return fs.existsSync(filepath);
}

/** The names a directory holds, sorted. */
export function directoryNames(directory: string): string[] {
  return fs.readdirSync(directory).sort();
}

/** Every file and directory under a directory, relative to it with `/` on every platform, sorted. */
export function directoryTree(directory: string): string[] {
  return fs
    .readdirSync(directory, { recursive: true, encoding: "utf8" })
    .map((entry) => entry.split(path.sep).join("/"))
    .sort();
}
