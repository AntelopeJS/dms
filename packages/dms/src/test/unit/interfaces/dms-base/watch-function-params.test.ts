import { BlockFunctions } from "@antelopejs/interface-dms/base/display";
import { FormFunctions } from "@antelopejs/interface-dms/base/form-types";
import { TableViewFunctions } from "@antelopejs/interface-dms/base/table-view";
import type { WatchFunctionParams as FromBaseTypes } from "@antelopejs/interface-dms/base/types";
import type {
  WatchFunctionId,
  WatchFunctionParams as FromBaseWatch,
} from "@antelopejs/interface-dms/base/types/watch";
import type { WatchFunctionParams as FromWatchActions } from "@antelopejs/interface-dms/watch-actions";
import { expect } from "chai";

const MODULE_FUNCTION = "Test.WatchFunctionParams.Module";

declare module "@antelopejs/interface-dms/base/types" {
  interface WatchFunctionParamMap {
    [MODULE_FUNCTION]: { moduleField: string };
  }
}

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

describe("WatchFunctionParamMap augmentation", () => {
  it("keeps the stock functions' params beside a module's augmentation through base/types, the path modules are told to use", () => {
    const resolved: [
      Same<
        FromWatchActions<typeof FormFunctions.SET_FIELD_DISABLED>,
        { targetField: string; setDisabled: boolean }
      >,
      Same<FromBaseWatch<typeof BlockFunctions.REFRESH_PAGE>, undefined>,
      Same<
        FromBaseTypes<typeof TableViewFunctions.CUSTOM_PAGE_FORM_SUCCESS>,
        { url: string; preserveQuery?: string[] }
      >,
      Same<FromWatchActions<typeof MODULE_FUNCTION>, { moduleField: string }>,
    ] = [true, true, true, true];
    const ids: WatchFunctionId[] = [
      FormFunctions.SET_FIELD_DISABLED,
      BlockFunctions.REFRESH_PAGE,
      TableViewFunctions.CUSTOM_PAGE_FORM_SUCCESS,
      MODULE_FUNCTION,
    ];

    expect(resolved).to.deep.equal([true, true, true, true]);
    expect(ids).to.deep.equal([
      "DmsComponent.Form.SetFieldDisabled",
      "DmsComponent.Block.RefreshPage",
      TableViewFunctions.CUSTOM_PAGE_FORM_SUCCESS,
      MODULE_FUNCTION,
    ]);
  });
});
