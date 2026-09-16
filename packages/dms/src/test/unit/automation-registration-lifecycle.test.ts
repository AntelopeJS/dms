import { expect } from "chai";
import { AutomationRegistrationLifecycle } from "../../automation/registration-lifecycle";

describe("AutomationRegistrationLifecycle", () => {
  it("retries cleanup after a teardown operation fails", () => {
    const lifecycle = new AutomationRegistrationLifecycle();
    let cleanupAttempts = 0;
    const cleanup = (): unknown[] => {
      cleanupAttempts += 1;
      return cleanupAttempts === 1 ? [new Error("temporary failure")] : [];
    };

    expect(lifecycle.beginRegistration()).to.equal(true);
    expect(lifecycle.cleanup(cleanup)).to.have.length(1);
    expect(lifecycle.isCleanupPending).to.equal(true);
    expect(lifecycle.beginRegistration()).to.equal(false);
    expect(lifecycle.cleanup(cleanup)).to.deep.equal([]);
    expect(cleanupAttempts).to.equal(2);
    expect(lifecycle.isCleanupPending).to.equal(false);
    expect(lifecycle.beginRegistration()).to.equal(true);
  });
});
