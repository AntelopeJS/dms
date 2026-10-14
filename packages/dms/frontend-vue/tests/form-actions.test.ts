import { describe, expect, it } from "vitest";
import { formShowsActions } from "../layers/dms-ui/app/composables/form/useForm";

describe("formShowsActions", () => {
  it("shows the buttons once the form has somewhere to submit to", () => {
    expect(formShowsActions({ submitUrl: "/api/order/new" }, [{}])).toBe(true);
    expect(formShowsActions({}, [{}])).toBe(false);
  });

  it("hides them on a form nothing in which can be filled in", () => {
    expect(
      formShowsActions({ submitUrl: "/api/order/new" }, [{ disabled: true }]),
    ).toBe(false);
  });

  it("shows the submit of an action form with nothing to fill in", () => {
    const action = { kind: "action", submitUrl: "/api/jobs/run" } as const;
    expect(formShowsActions(action, [])).toBe(true);
    expect(formShowsActions(action, [{ disabled: true }])).toBe(true);
    expect(formShowsActions({ ...action, saveMode: "none" }, [])).toBe(false);
  });

  it("hides them with saveMode none, whatever the form could submit", () => {
    expect(
      formShowsActions({ saveMode: "none", submitUrl: "/api/order/new" }, [{}]),
    ).toBe(false);
    expect(
      formShowsActions({ saveMode: "footer", submitUrl: "/api/order/new" }, [
        {},
      ]),
    ).toBe(true);
  });
});
