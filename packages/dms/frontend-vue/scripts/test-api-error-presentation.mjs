import assert from "node:assert/strict";
import ts from "typescript";
import {
  analyzeApiErrorScript,
  apiErrorScripts,
} from "./check-api-error-presentation.mjs";
import { migrateApiErrorSource } from "./codemods/api-error-presenter.mjs";
import { parse } from "vue/compiler-sfc";

const rejected = [
  `try { await save() } catch (error) { toast.add({ title: t('save.failed'), color: 'error' }) }`,
  `save().catch(error => { toast.update(id, { color: 'error' }) })`,
  `save().then(done, error => { toast.add({ color: Color.error }) })`,
  `const notices = useToast(); try {} catch (error) { notices.add({ color: 'warning' }) }`,
  `const { add: notify } = useToast(); try {} catch (error) { notify({ color: FAILURE_COLOR }) }`,
  `const notices = useToast(); const alias = notices; try {} catch (error) { alias.update(id, payload) }`,
  `import { ERROR_COLOR } from './colors'; try {} catch (error) { toast.add({ color: ERROR_COLOR }) }`,
  `const payload = { color: 'error' }; try {} catch (error) { toast.add(payload) }`,
  `save().catch(error => { toast.add({ title: t('save.failed') }) })`,
];
for (const source of rejected)
  assert.equal(
    analyzeApiErrorScript(source, "fixture.ts", ts).length,
    1,
    source,
  );

const allowed = [
  `try { await save(); toast.add({ color: 'success' }) } catch (error) { presentError(error, { fallbackKey: 'save.failed' }) }`,
  `try { await track() } catch {} finally { loading.value = false }`,
  `toast.add({ color: 'info', title: t('product.notice') })`,
  `save().catch(() => { toast.add({ color: 'success' }) })`,
];
for (const source of allowed)
  assert.equal(
    analyzeApiErrorScript(source, "fixture.ts", ts).length,
    0,
    source,
  );

const vue = `<script setup lang="ts">
const toast = useToast();
async function save() {
  try { await write() } catch (failure) { toast.add({ title: t("save.failed"), color: "error" }); }
}
</script><template><button @click="save">Save</button></template>`;
const migrated = migrateApiErrorSource("fixture.vue", vue);
assert.ok(migrated.rewritten);
assert.deepEqual(migrated.manual, []);
assert.ok(
  migrated.output.includes(
    'presentError(failure, { fallbackKey: "save.failed" })',
  ),
);
assert.equal(
  migrateApiErrorSource("fixture.vue", migrated.output).rewritten,
  false,
);
for (const script of apiErrorScripts("fixture.vue", migrated.output, { parse }))
  assert.equal(
    analyzeApiErrorScript(script.source, "fixture.vue", ts).length,
    0,
  );

const composable = `export function useSave() { return async () => { try { await save() } catch (error) { toast.add({ title: t('save.failed'), color: 'error' }); } } }`;
const converted = migrateApiErrorSource("fixture.ts", composable);
assert.ok(
  converted.output.indexOf("const { presentError }") <
    converted.output.indexOf("return async"),
);
assert.ok(converted.output.includes("import { useApiErrorPresenter }"));

for (const source of [
  `async function save() { try {} catch (error) { toast.add({ title: t('save.failed'), color: 'error' }); } }`,
  `export function useSave() { try {} catch { toast.add({ title: t('save.failed'), color: 'error' }); } }`,
  `export function useSave() { try {} catch (error) { toast.update(id, { title: t('save.failed'), color: 'error' }); } }`,
  `export function useSave() { try {} catch (error) { toast.add({ title: t(dynamic), color: 'error' }); } }`,
  `export function useSave() { try {} catch (error) { toast.add({ title: t('save.failed'), color: color() }); } }`,
  `export function useSave() { try {} catch (error) { toast.add({ title: t('save.failed'), icon: icon(), color: 'error' }); } }`,
  `<script>try {} catch (error) { toast.add({ title: t('save.failed'), color: 'error' }); }</script>`,
]) {
  const file = source.startsWith("<script") ? "manual.vue" : "manual.ts";
  const result = migrateApiErrorSource(file, source);
  assert.equal(result.output, source);
  assert.deepEqual(Object.keys(result.manual[0]), [
    "file",
    "line",
    "reason",
    "expression",
  ]);
  assert.equal(result.manual[0].reason, "manual-error-presentation");
}
console.log("PASS API error invariant and codemod fixtures");
