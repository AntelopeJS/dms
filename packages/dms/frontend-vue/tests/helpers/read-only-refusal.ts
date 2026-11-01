import { ref } from "vue";
import { vi } from "vitest";
import { useReadOnlyRefusal } from "../../layers/dms-core/app/composables/useReadOnlyRefusal";

export function installReadOnlyRefusal() {
  const presented = ref(new WeakSet<object>());
  vi.stubGlobal("useDmsState", () => presented);
  vi.stubGlobal("getAppTranslation", () => ({
    processApiMessage: (key: string) => key,
  }));
  vi.stubGlobal("useReadOnlyRefusal", useReadOnlyRefusal);
}

export function readOnlyFailure() {
  return {
    response: new Response(null, {
      status: 403,
      headers: { "x-dms-readonly": "1" },
    }),
    statusCode: 403,
    data: { fields: ["roles"], message: "Private backend message" },
  };
}

export function unmarkedForbiddenFailure() {
  return Object.assign(new Error("Forbidden"), {
    response: new Response(null, { status: 403 }),
    data: "error.forbidden",
  });
}
