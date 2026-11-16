import fs from "node:fs";
import path from "node:path";

function collect(
  root: string,
  folder: string,
  out: Map<string, string>,
): Map<string, string> {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") collect(root, file, out);
    } else {
      out.set(path.relative(root, file), fs.readFileSync(file, "utf8"));
    }
  }
  return out;
}

/** Every file under `root` but those of `node_modules`, by path relative to `root`, with its text. */
export function readTree(root: string): Map<string, string> {
  return collect(root, root, new Map());
}
