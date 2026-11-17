/**
 * ESLint flat-config globals for every name the DMS layer auto-imports from
 * the directories its `dms.frontend.build.ts` declares, for
 * `languageOptions.globals`. Combine with
 * `@antelopejs/dms-frontend/eslint-globals`.
 */
declare const eslintGlobals: Readonly<Record<string, "readonly">>;
export default eslintGlobals;
