/**
 * What a caught value says: the message of an `Error`, else the value as text.
 *
 * @param {unknown} failure What was thrown or rejected
 * @returns {string} The text
 */
export function describeFailure(failure) {
  return failure instanceof Error ? failure.message : String(failure);
}
