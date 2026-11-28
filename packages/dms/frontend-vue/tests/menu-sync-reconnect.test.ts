import { nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("defineDmsPlugin", <Setup>(setup: Setup) => setup);
const { watchRealtimeOpenings } = await import(
  "../layers/dms-layout/app/plugins/dms-menu-sync.client"
);

describe("the openings of the realtime stream", () => {
  it("tells the first opening from each reopening", async () => {
    const sessionId = ref<string | undefined>(undefined);
    const onOpen = vi.fn();
    watchRealtimeOpenings(sessionId, onOpen);

    sessionId.value = "session-1";
    await nextTick();
    expect(onOpen.mock.calls).toEqual([[true]]);

    sessionId.value = undefined;
    await nextTick();
    sessionId.value = "session-2";
    await nextTick();
    expect(onOpen.mock.calls).toEqual([[true], [false]]);

    sessionId.value = undefined;
    await nextTick();
    sessionId.value = "session-3";
    await nextTick();
    expect(onOpen.mock.calls).toEqual([[true], [false], [false]]);
  });

  it("counts a stream already open when it starts as its first opening, at once (catches a session that opened before the menu sync and is never checked)", async () => {
    const sessionId = ref<string | undefined>("session-1");
    const onOpen = vi.fn();
    watchRealtimeOpenings(sessionId, onOpen);
    expect(onOpen.mock.calls).toEqual([[true]]);

    sessionId.value = undefined;
    await nextTick();
    sessionId.value = "session-2";
    await nextTick();
    expect(onOpen.mock.calls).toEqual([[true], [false]]);
  });
});
