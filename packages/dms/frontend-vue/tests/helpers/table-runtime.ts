import * as vue from "vue";
import { afterAll, beforeEach, vi } from "vitest";
import { browserRuntime, engine, stubApiData } from "./api-data-runtime";
import { useSessionRecovery } from "../../layers/dms-core/app/composables/auth/useSessionRecovery";
import { useTranslation } from "../../layers/dms-core/app/composables/translation/useTranslation";
import { useDataTypes } from "../../layers/dms-core/app/composables/data-types/useDataType";
import {
  evaluateRowActionRule,
  normalizeActionConfig,
} from "../../layers/dms-core/app/utils/row-action-rule-evaluator";
import { useUserRealtime } from "../../layers/dms-core/app/composables/realtime/useUserRealtime";
import { createFakeBrowser } from "../fixtures/fakeBrowser";
import {
  BASE_URL,
  createRealtimeServer,
  installRealtimeFetch,
} from "../fixtures/realtimeServer";

const loggedIn = vue.ref(false);
const realtimeScope = vue.effectScope();
let realtime: ReturnType<typeof useUserRealtime> | undefined;
let server: ReturnType<typeof createRealtimeServer>;

afterAll(() => realtimeScope.stop());

async function settleStream() {
  for (let round = 0; round < 100; round++) await Promise.resolve();
  await vue.nextTick();
}

export async function startTableRealtime() {
  vi.stubEnv("SSR", false);
  vi.stubGlobal("useDmsRuntimeConfig", () => ({
    public: { dms: { baseURL: BASE_URL } },
  }));
  vi.stubGlobal("useDmsUserSession", () => ({
    loggedIn,
    user: vue.ref({ _id: "table-reader" }),
    session: vue.ref({ accountId: "account" }),
    fetch: async () => {},
  }));
  vi.stubGlobal("useDmsRouter", () => ({}));
  vi.stubGlobal("useSessionRecovery", useSessionRecovery);
  createFakeBrowser().openTab().activate();
  server = createRealtimeServer();
  installRealtimeFetch(server);
  loggedIn.value = true;
  realtime ??= realtimeScope.run(useUserRealtime);
  await settleStream();
}

export async function publishTableEvent(
  topic: string,
  snapshot = false,
  event: object = { type: "request", ts: 1 },
) {
  if (!realtime?.sessionId.value) throw new Error("Realtime session not open");
  server.send(
    realtime.sessionId.value,
    snapshot ? "snapshot" : "event",
    snapshot ? { topic, entries: [] } : { topic, ...event },
  );
  await settleStream();
}

export async function stopTableRealtime() {
  loggedIn.value = false;
  await settleStream();
  vi.unstubAllEnvs();
}

beforeEach(() => {
  for (const [name, value] of Object.entries(vue)) vi.stubGlobal(name, value);
  vi.stubGlobal("useDmsAppConfig", () => ({}));
  vi.stubGlobal("useDmsApp", engine.useDmsApp);
  vi.stubGlobal("useTranslation", useTranslation);
  vi.stubGlobal("useDataTypes", useDataTypes);
  vi.stubGlobal("evaluateRowActionRule", evaluateRowActionRule);
  vi.stubGlobal("normalizeActionConfig", normalizeActionConfig);
  stubApiData(
    async (_url: string, options: { query: { resourceKey: string } }) => ({
      resourceKey: options.query.resourceKey,
      url: `/files/${options.query.resourceKey}`,
    }),
  );
  browserRuntime();
});
