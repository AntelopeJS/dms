import { nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("defineDmsPlugin", <Setup>(setup: Setup) => setup);
const { watchRealtimeReconnects } = await import(
  "../layers/dms-layout/app/plugins/dms-menu-sync.client"
);

describe("the menu resync on a realtime reconnect", () => {
  it("leaves the first opening alone and resyncs on each reopening", async () => {
    const sessionId = ref<string | undefined>(undefined);
    const onReconnect = vi.fn();
    watchRealtimeReconnects(sessionId, onReconnect);

    sessionId.value = "session-1";
    await nextTick();
    expect(onReconnect).not.toHaveBeenCalled();

    sessionId.value = undefined;
    await nextTick();
    sessionId.value = "session-2";
    await nextTick();
    expect(onReconnect).toHaveBeenCalledOnce();

    sessionId.value = undefined;
    await nextTick();
    sessionId.value = "session-3";
    await nextTick();
    expect(onReconnect).toHaveBeenCalledTimes(2);
  });

  it("counts a stream already open when it starts as its first opening", async () => {
    const sessionId = ref<string | undefined>("session-1");
    const onReconnect = vi.fn();
    watchRealtimeReconnects(sessionId, onReconnect);

    sessionId.value = undefined;
    await nextTick();
    sessionId.value = "session-2";
    await nextTick();
    expect(onReconnect).toHaveBeenCalledOnce();
  });
});
