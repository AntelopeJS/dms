import type { App } from "vue";
import { engine } from "./api-data-runtime";
import { stubBlockRuntime } from "./block-runtime";

export async function chartRuntime<Response = null>(
  app: App,
  response: Response | null = null,
) {
  await stubBlockRuntime(async () => response);
  engine.provideDmsFrontendRuntime(
    app,
    engine.createDmsFrontendRuntime(undefined, {}, true),
  );
}
