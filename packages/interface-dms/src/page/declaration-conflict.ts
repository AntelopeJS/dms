/**
 * A declaration a page cannot honour, such as two components claiming what
 * only one of them may hold. Fatal: rethrown out of the hooks that isolate
 * component errors, so the page fails to register instead of booting with one
 * of the two declarations silently dropped.
 */
export class PageDeclarationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
