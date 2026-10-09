import { readFileSync } from "node:fs";
import { createSSRApp, defineComponent, h, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FormLoadError from "../layers/dms-ui/app/build/components/form/FormLoadError.vue";
import {
  type FormLoadSource,
  trackFormRecordLoad,
} from "../layers/dms-ui/app/build/composables/form/formRecordLoad";

// A role that may edit a table's rows but not view them opened the edit form
// empty: the row's read was refused, the form showed its blank fields, and a
// value picked there replaced the row's own. A form whose record does not
// load shows why, with a retry, and cannot be saved.

const ROW = { values: { email: "zz-invitee@example.com" }, initial: {} };
const FORBIDDEN = Object.assign(new Error("Forbidden"), { statusCode: 403 });

interface Payload {
  values: Record<string, unknown>;
  initial: Record<string, unknown>;
}

function loadOf(
  data: Payload | null,
  error: unknown,
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

  it("applies a record that loaded", () => {
    const apply = vi.fn();
    const load = trackFormRecordLoad(loadOf(ROW, null), apply);
    expect(load.failure.value).toBe(null);
    expect(apply).toHaveBeenCalledWith(ROW);
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

  async function render(failure: "forbidden" | "error"): Promise<string> {
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

  it("has its texts in English and French", () => {
    for (const file of ["ui-en-GB.json", "ui-fr-FR.json"]) {
      const locale = JSON.parse(
        readFileSync(
          new URL(`../layers/dms-ui/i18n/locales/${file}`, import.meta.url),
          "utf8",
        ),
      );
      expect(Object.keys(locale.dms.form.load_error).sort()).toEqual([
        "error_description",
        "error_title",
        "forbidden_description",
        "forbidden_title",
        "retry",
      ]);
    }
  });
});

describe("a form whose record did not load", () => {
  const formSource = readFileSync(
    new URL("../layers/dms-ui/app/components/form/Form.vue", import.meta.url),
    "utf8",
  );

  it("shows the load error instead of its fields", () => {
    expect(formSource).toMatch(
      /<div v-if="loadFailure"[^>]*>\s*<DmsFormLoadError[\s\S]*?<\/div>\s*<div v-else :class="surfaceClasses\.body">/,
    );
  });

  it("cannot be saved: no save bar, and a submit is refused", () => {
    expect(formSource).toMatch(
      /<DmsSaveBar\s+v-if="canSave && !isInstant && !loadFailure"/,
    );
    expect(formSource).toMatch(
      /function onSubmit\([^)]*\) \{\s*if \(loadFailure\.value \|\| !runValidators\(\)\) return;/,
    );
  });
});
