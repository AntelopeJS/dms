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

  it("shows them when asked, before there is an address or a field", () => {
    expect(formShowsActions({ showActions: true }, [])).toBe(true);
  });

  it("hides them when asked, whatever the form could submit", () => {
    expect(
      formShowsActions({ showActions: false, submitUrl: "/api/order/new" }, [
        {},
      ]),
    ).toBe(false);
  });
});
