import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { analyzeApiErrorScript } from "./check-api-error-presentation.mjs";

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

const linkRoot = mkdtempSync(join(tmpdir(), "dms-api-error-cli-"));
const appRoot = mkdtempSync(
  fileURLToPath(new URL("../.api-error-cli-", import.meta.url)),
);
try {
  const scripts = join(linkRoot, "scripts");
  symlinkSync(fileURLToPath(new URL(".", import.meta.url)), scripts, "dir");
  writeFileSync(join(appRoot, "package.json"), "{}");
  mkdirSync(join(appRoot, "app"));
  writeFileSync(
    join(appRoot, "app", "manual.ts"),
    `export function useSave() { try {} catch (error) { toast.add({ title: t(dynamic), color: 'error' }); } }`,
  );
  const checker = spawnSync(
    process.execPath,
    [join(scripts, "check-api-error-presentation.mjs"), join(appRoot, "app")],
    { encoding: "utf8" },
  );
  assert.notEqual(checker.status, 0, "checker fails through a symlinked path");
} finally {
  rmSync(linkRoot, { recursive: true, force: true });
  rmSync(appRoot, { recursive: true, force: true });
}
console.log("PASS API error invariant fixtures");
