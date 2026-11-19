/**
 * Sets variables of `process.env` for one test, and restores them after it:
 * a value is set, `undefined` removes the variable.
 *
 * @param {import("node:test").TestContext} t The test
 * @param {Record<string, string | undefined>} values The variables
 */
export function setEnv(t, values) {
  const previous = Object.fromEntries(
    Object.keys(values).map((name) => [name, process.env[name]]),
  );
  /** @param {Record<string, string | undefined>} entries */
  const apply = (entries) => {
    for (const [name, value] of Object.entries(entries)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
  t.after(() => apply(previous));
  apply(values);
}
