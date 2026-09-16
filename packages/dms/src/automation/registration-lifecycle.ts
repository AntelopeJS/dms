export type CleanupOperation = () => unknown[];

/** Tracks registration cleanup until every teardown operation succeeds. */
export class AutomationRegistrationLifecycle {
  private mustCleanup = false;

  beginRegistration(): boolean {
    if (this.mustCleanup) return false;
    this.mustCleanup = true;
    return true;
  }

  cleanup(operation: CleanupOperation): unknown[] {
    if (!this.mustCleanup) return [];
    const errors = operation();
    this.mustCleanup = errors.length > 0;
    return errors;
  }

  get isCleanupPending(): boolean {
    return this.mustCleanup;
  }
}
