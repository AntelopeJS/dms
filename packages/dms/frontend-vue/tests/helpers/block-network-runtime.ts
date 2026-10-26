import * as vue from "vue";
import { createI18n } from "vue-i18n";
import { vi } from "vitest";
import { engine, browserRuntime } from "./api-data-runtime";
import { stubBlockRuntime } from "./block-runtime";
import { useModal } from "../../layers/dms-ui/app/composables/containers/useModal";
import { useDrawer } from "../../layers/dms-ui/app/composables/containers/useDrawer";
import { useConfirm } from "../../layers/dms-ui/app/composables/confirm/useConfirm";
import { useExportJob } from "../../layers/dms-ui/app/composables/useExportJob";
import { useSiteLayout } from "../../layers/dms-layout/app/composables/page/useSiteLayout";
import DmsCard from "../../layers/dms-ui/app/components/card/Card.vue";
import { Color } from "../../layers/dms-core/app/types/color";
import { HttpMethod } from "../../layers/dms-core/app/types/http";
import { useUserRealtime } from "../../layers/dms-core/app/composables/realtime/useUserRealtime";
import { createFakeBrowser } from "../fixtures/fakeBrowser";
import {
  BASE_URL,
  createRealtimeServer,
  installRealtimeFetch,
} from "../fixtures/realtimeServer";

export { engine, browserRuntime };

export async function provideBlockRuntime(app: vue.App, server = false) {
  const runtime = engine.createDmsFrontendRuntime(undefined, undefined, server);
  engine.provideDmsFrontendRuntime(app, runtime);
  const i18n = createI18n({ legacy: false, locale: "en-US", messages: {} });
  await engine.installDmsPlugins(app, i18n.global, runtime, async () => ({}), [
    "en-US",
  ]);
  return runtime;
}

export async function installBlockNetwork(
  fetch: Parameters<typeof stubBlockRuntime>[0],
) {
  await stubBlockRuntime(fetch);
  for (const [name, value] of Object.entries(vue)) vi.stubGlobal(name, value);
  for (const [name, value] of Object.entries({
    useModal,
    useDrawer,
    useConfirm,
    useExportJob,
    useSiteLayout,
    Color,
    HttpMethod,
  }))
    vi.stubGlobal(name, value);
  vi.stubGlobal("useI18n", () => ({
    locale: vue.ref("en-US"),
    t: (key: string) => key,
  }));
  vi.stubGlobal("useToast", () => ({ add: vi.fn() }));
  vi.stubGlobal("useOverlay", () => ({
    create: () => ({ open: async () => false }),
  }));
}

export const Slot = vue.defineComponent({
  props: {
    title: { type: String, default: undefined },
    description: { type: String, default: undefined },
    label: { type: String, default: undefined },
  },
  setup:
    (props, { slots }) =>
    () =>
      vue.h("div", [
        props.title,
        props.description,
        props.label,
        ...Object.values(slots).flatMap((slot) => slot?.() ?? []),
      ]),
});
export const Skeleton = vue.defineComponent({
  render: () => vue.h("span", { "data-test-skeleton": "" }),
});

export function registerBlockUi(app: vue.App) {
  for (const name of [
    "UCard",
    "UBadge",
    "UIcon",
    "UButton",
    "UAlert",
    "UTooltip",
    "ULink",
    "UAvatar",
    "NuxtLink",
  ])
    app.component(name, Slot);
  app.component("DmsCard", DmsCard);
  if (!app.component("DmsLink")) app.component("DmsLink", engine.DmsLink);
  app.component("USkeleton", Skeleton);
}

const realtimeScope = vue.effectScope();
let realtime: ReturnType<typeof useUserRealtime> | undefined;
let realtimeSession: ReturnType<typeof engine.useDmsUserSession> | undefined;
let server: ReturnType<typeof createRealtimeServer>;

async function settleStream() {
  for (let round = 0; round < 100; round++) await Promise.resolve();
  await vue.nextTick();
}

export async function startBlockRealtime() {
  vi.stubEnv("SSR", false);
  vi.stubGlobal("useDmsRuntimeConfig", () => ({
    public: { dms: { baseURL: BASE_URL } },
  }));
  createFakeBrowser().openTab().activate();
  server = createRealtimeServer();
  installRealtimeFetch(server);
  realtimeSession ??= engine.useDmsUserSession();
  realtimeSession.session.value = { accountId: "account" };
  realtimeSession.user.value = { _id: "block-reader" };
  realtime ??= realtimeScope.run(useUserRealtime);
  await settleStream();
}

export async function publishBlockEvent(topic: string) {
  if (!realtime?.sessionId.value) throw new Error("Realtime session not open");
  server.send(realtime.sessionId.value, "event", {
    topic,
    type: "request",
    ts: 1,
  });
  await settleStream();
}

export async function stopBlockRealtime() {
  if (realtimeSession) realtimeSession.user.value = null;
  await settleStream();
  vi.unstubAllEnvs();
}

export function disposeBlockRealtime() {
  realtimeScope.stop();
}
