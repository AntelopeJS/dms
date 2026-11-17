import path from "node:path";

/**
 * Whether `candidate` is `folder` or lies under it. ts-morph names a file with
 * `/` and `node:path` with the platform's separator, and Windows ignores the
 * case of a drive letter, so the two are compared through `relative`, never as
 * text.
 *
 * @param paths - The platform's path functions; a spec passes `path.win32`.
 */
export function isInsideFolder(
  folder: string,
  candidate: string,
  paths: typeof path = path,
): boolean {
  const relative = paths.relative(folder, candidate);
  return (
    relative !== ".." &&
    !relative.startsWith(`..${paths.sep}`) &&
    !paths.isAbsolute(relative)
  );
}

/**
 * `to` relative to `from`, with `/` between its segments: the form the
 * project configuration stores a path in on every platform.
 *
 * @param paths - The platform's path functions; a spec passes `path.win32`.
 */
export function posixRelative(
  from: string,
  to: string,
  paths: typeof path = path,
): string {
  return paths.relative(from, to).split(paths.sep).join("/");
}
