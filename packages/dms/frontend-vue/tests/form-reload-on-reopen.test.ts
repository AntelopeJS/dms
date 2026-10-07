import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const formSource = readFileSync(
  new URL("../layers/dms-ui/app/components/form/Form.vue", import.meta.url),
  "utf8",
);

// The load of a form is cached under its component and page ids, which a
// drawer or modal reopened on the same row shares: the second opening showed
// the first one's values, stale if the row changed in between, and a save
// then wrote them back.
it("fetches its record again every time a form is mounted", () => {
  const loadBlock = formSource.slice(
    formSource.indexOf("if (props.fetchUrl) {"),
  );
  expect(loadBlock).toMatch(
    /const formLoad = await useDmsAsyncData\([\s\S]*?onMounted\(\(\) => \{\s*formLoad\.status\.value = "idle";\s*\}\);/,
  );
});
