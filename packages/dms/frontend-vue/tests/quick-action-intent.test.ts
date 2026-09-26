import { describe, expect, it } from "vitest";
import {
  QUICK_ACTION_ADD,
  QUICK_ACTION_BUTTON,
  QUICK_ACTION_BUTTON_KEY,
  QUICK_ACTION_COMPONENT_KEY,
  QUICK_ACTION_QUERY_KEY,
  readQuickActionIntent,
} from "../layers/dms-ui/app/types/quick-actions";

const COMPONENT_ID = "table";

describe("readQuickActionIntent", () => {
  it("reads an open-form intent addressed to the table view", () => {
    const intent = readQuickActionIntent(
      {
        [QUICK_ACTION_QUERY_KEY]: QUICK_ACTION_ADD,
        [QUICK_ACTION_COMPONENT_KEY]: COMPONENT_ID,
      },
      COMPONENT_ID,
    );

    expect(intent).toEqual({ kind: "add" });
  });

  it("reads which button a button intent presses", () => {
    const intent = readQuickActionIntent(
      {
        [QUICK_ACTION_QUERY_KEY]: QUICK_ACTION_BUTTON,
        [QUICK_ACTION_COMPONENT_KEY]: COMPONENT_ID,
        [QUICK_ACTION_BUTTON_KEY]: "invite",
      },
      COMPONENT_ID,
    );

    expect(intent).toEqual({ kind: "button", button: "invite" });
  });

  it("ignores a button intent that names no button", () => {
    const intent = readQuickActionIntent(
      {
        [QUICK_ACTION_QUERY_KEY]: QUICK_ACTION_BUTTON,
        [QUICK_ACTION_COMPONENT_KEY]: COMPONENT_ID,
      },
      COMPONENT_ID,
    );

    expect(intent).toBeUndefined();
  });

  it("ignores an intent addressed to another table view", () => {
    const intent = readQuickActionIntent(
      {
        [QUICK_ACTION_QUERY_KEY]: QUICK_ACTION_ADD,
        [QUICK_ACTION_COMPONENT_KEY]: "other-table",
      },
      COMPONENT_ID,
    );

    expect(intent).toBeUndefined();
  });

  it("ignores an unknown intent", () => {
    const intent = readQuickActionIntent(
      {
        [QUICK_ACTION_QUERY_KEY]: "unknown",
        [QUICK_ACTION_COMPONENT_KEY]: COMPONENT_ID,
      },
      COMPONENT_ID,
    );

    expect(intent).toBeUndefined();
  });
});
