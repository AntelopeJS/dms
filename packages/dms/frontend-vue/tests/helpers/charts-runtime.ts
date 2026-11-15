import type { App } from "vue";
import { engine } from "./api-data-runtime";
import { stubBlockRuntime } from "./block-runtime";

export async function chartRuntime(
  app: App,
  response: Awaited<ReturnType<Parameters<typeof stubBlockRuntime>[0]>> = null,
) {
  await stubBlockRuntime(async () => response);
  engine.provideDmsFrontendRuntime(
    app,
    engine.createDmsFrontendRuntime(undefined, {}, true),
  );
}
