const FILE_NOT_FOUND_ERROR_NAME = "FileNotFoundError";

/**
 * Whether the storage refused because the file does not exist.
 *
 * Reads the error's `name`, which every release of
 * `@antelopejs/interface-file-storage` sets, so the check holds whichever copy
 * the storage module loaded. `instanceof FileNotFoundError` is false across
 * copies.
 */
export function isFileNotFoundError<T>(error: T): error is T & Error {
  return error instanceof Error && error.name === FILE_NOT_FOUND_ERROR_NAME;
}
