import { BlockFunctions, refreshPageBlocks } from "../../../utils/blockRefresh";

export function registerBlockFunctions() {
  const { registerFunction } = useDefinedFunctions();

  registerFunction(BlockFunctions.REFRESH_PAGE, () => refreshPageBlocks());
}
