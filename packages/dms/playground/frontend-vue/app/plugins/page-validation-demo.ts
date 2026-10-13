/**
 * The validation function the dynamic navigation's project page names in
 * `validation.customFunctionId`: a project id outside this list fails the
 * validation, and the page's `redirectTo` sends the user to the overview.
 *
 * Universal, not `.client`: the server render validates the page too, and
 * answers the redirect itself.
 */
const KNOWN_PROJECT_FUNCTION_ID = "playground:known-project";
const KNOWN_PROJECTS = ["invoicer", "resto-lucca", "sleepy-api"];

interface ValidatedRoute {
  query: Record<string, unknown>;
}

function isKnownProject(route: ValidatedRoute): boolean {
  return KNOWN_PROJECTS.includes(String(route.query.project));
}

export default defineDmsPlugin(() => {
  useDefinedFunctions().registerFunction(
    KNOWN_PROJECT_FUNCTION_ID,
    isKnownProject,
  );
});
