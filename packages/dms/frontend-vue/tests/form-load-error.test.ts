import { createSSRApp, defineComponent, h, nextTick, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FormLoadError from "../layers/dms-ui/app/build/components/form/FormLoadError.vue";
import {
  type FormLoadFailure,
  type FormLoadSource,
  missingRecordFailure,
  trackFormRecordLoad,
} from "../layers/dms-ui/app/build/composables/form/formRecordLoad";

const ROW = { values: { email: "zz-invitee@example.com" }, initial: {} };
const FORBIDDEN = Object.assign(new Error("Forbidden"), { statusCode: 403 });

type Payload = typeof ROW;

function loadOf(
  data: Payload | null,
  error: FormLoadSource<Payload>["error"]["value"],
  next?: { data: Payload; error: unknown },
): FormLoadSource<Payload> {
  const load: FormLoadSource<Payload> = {
    data: ref(data),
    error: ref(error),
    refresh: vi.fn(async () => {
      if (!next) return;
      load.data.value = next.data;
      load.error.value = next.error;
    }),
  };
  return load;
}

describe("a form's record load", () => {
  it("reports a refused read as forbidden and applies nothing", () => {
    const apply = vi.fn();
    const load = trackFormRecordLoad(loadOf(null, FORBIDDEN), apply);
    expect(load.failure.value).toBe("forbidden");
    expect(apply).not.toHaveBeenCalled();
  });

  it("reports a 404 as not found, apart from other failures", () => {
    const apply = vi.fn();
    const gone = Object.assign(new Error("Not Found"), { statusCode: 404 });
    const load = trackFormRecordLoad(loadOf(ROW, gone), apply);
    expect(load.failure.value).toBe("not_found");
    expect(apply).not.toHaveBeenCalled();
  });

  it("never applies the values an earlier opening left in the cache", () => {
    const apply = vi.fn();
    const load = trackFormRecordLoad(loadOf(ROW, new Error("network")), apply);
    expect(load.failure.value).toBe("error");
    expect(apply).not.toHaveBeenCalled();
  });

  it("opens on the record once a retry loads it", async () => {
    const apply = vi.fn();
    const source = loadOf(null, FORBIDDEN, { data: ROW, error: null });
    const load = trackFormRecordLoad(source, apply);
    await load.retry();
    expect(source.refresh).toHaveBeenCalledOnce();
    expect(load.failure.value).toBe(null);
    expect(load.retrying.value).toBe(false);
    expect(apply).toHaveBeenCalledWith(ROW);
  });

  it("takes a later read of the record, its values becoming the saved ones", async () => {
    const apply = vi.fn();
    const onReloaded = vi.fn();
    const source = loadOf(ROW, null);
    trackFormRecordLoad(source, apply, { onReloaded });
    const fresh = { values: { email: "fresh@example.com" }, initial: {} };
    source.data.value = fresh;
    await nextTick();
    expect(apply).toHaveBeenLastCalledWith(fresh);
    expect(onReloaded).toHaveBeenCalledOnce();
  });

  it("leaves a later read out while the user edits", async () => {
    const apply = vi.fn();
    const onReloaded = vi.fn();
    const source = loadOf(ROW, null);
    trackFormRecordLoad(source, apply, {
      isEditing: () => true,
      onReloaded,
    });
    source.data.value = { values: { email: "other@example.com" }, initial: {} };
    await nextTick();
    expect(apply).toHaveBeenCalledOnce();
    expect(onReloaded).not.toHaveBeenCalled();
  });

  it("stops showing the cached record once a later read is refused", async () => {
    const apply = vi.fn();
    const source = loadOf(ROW, null);
    const load = trackFormRecordLoad(source, apply);
    source.error.value = FORBIDDEN;
    await nextTick();
    expect(load.failure.value).toBe("forbidden");
  });

  it("applies a record that loaded", () => {
    const apply = vi.fn();
    const load = trackFormRecordLoad(loadOf(ROW, null), apply);
    expect(load.failure.value).toBe(null);
    expect(apply).toHaveBeenCalledWith(ROW);
  });
});

describe("a form about a record its address names none of", () => {
  const FETCH_URL = "/api/tasks/get?id={{query.id}}";

  it("reports the record missing while the id is not in the address", () => {
    expect(
      missingRecordFailure({ requiresRecord: true, fetchUrl: FETCH_URL }),
    ).toBe("missing");
  });

  it("reports nothing once the address names the record", () => {
    expect(
      missingRecordFailure({
        requiresRecord: true,
        fetchUrl: FETCH_URL,
        resolvedFetchUrl: "/api/tasks/get?id=1",
      }),
    ).toBe(null);
  });

  it("leaves a form that may open without a record to its defaults", () => {
    expect(missingRecordFailure({ fetchUrl: FETCH_URL })).toBe(null);
    expect(missingRecordFailure({ requiresRecord: true })).toBe(null);
  });
});

describe("the load error a form shows", () => {
  const Slot = defineComponent({
    props: {
      title: { type: String, default: "" },
      description: { type: String, default: "" },
      label: { type: String, default: "" },
    },
    setup:
      (props, { slots }) =>
      () =>
        h("div", [
          props.title,
          props.description,
          props.label,
          slots.default?.(),
          slots.actions?.(),
        ]),
  });

  async function render(failure: FormLoadFailure): Promise<string> {
    const app = createSSRApp({
      render: () => h(FormLoadError, { failure }),
    });
    for (const name of ["UButton", "UIcon"]) app.component(name, Slot);
    return renderToString(app);
  }

  beforeEach(() => {
    vi.stubGlobal("useI18n", () => ({ t: String }));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("says the read was refused, with a retry", async () => {
    const html = await render("forbidden");
    expect(html).toContain("dms.form.load_error.forbidden_title");
    expect(html).toContain("dms.form.load_error.forbidden_description");
    expect(html).toContain("dms.form.load_error.retry");
  });

  it("says the load failed, with a retry", async () => {
    const html = await render("error");
    expect(html).toContain("dms.form.load_error.error_title");
    expect(html).toContain("dms.form.load_error.retry");
  });

  it("says the entry is not found, with nothing to retry", async () => {
    const html = await render("not_found");
    expect(html).toContain("dms.form.load_error.not_found_title");
    expect(html).not.toContain("dms.form.load_error.retry");
  });

  it("says no entry is selected, with nothing to retry", async () => {
    const html = await render("missing");
    expect(html).toContain("dms.form.load_error.missing_title");
    expect(html).toContain("dms.form.load_error.missing_description");
    expect(html).not.toContain("dms.form.load_error.retry");
  });
});
