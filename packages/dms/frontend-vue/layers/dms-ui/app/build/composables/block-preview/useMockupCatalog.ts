import {
  computed,
  onMounted,
  shallowRef,
  type ComputedRef,
  type Ref,
} from "vue";
import { MOCKUP_LIST_ENDPOINT } from "../../utils/mockup";
import {
  parseBlockCatalog,
  type MockupBlockType,
} from "../../utils/mockupCatalog";

type AuthFetch = ReturnType<typeof useAuthFetch>["$authFetch"];

/** The block types the editor offers, read once from the backend. */
export interface MockupCatalog {
  blocks: Readonly<Ref<MockupBlockType[]>>;
  byType: ComputedRef<ReadonlyMap<string, MockupBlockType>>;
  hasFailed: Readonly<Ref<boolean>>;
}

const CATALOG_ENDPOINT = `${MOCKUP_LIST_ENDPOINT}/schema/blocks`;

/** Reads `GET /api/mockup/schema/blocks` once the editor mounts. */
export function useMockupCatalog(authFetch: AuthFetch): MockupCatalog {
  const blocks = shallowRef<MockupBlockType[]>([]);
  const hasFailed = shallowRef(false);
  onMounted(async () => {
    try {
      const parsed = parseBlockCatalog(await authFetch(CATALOG_ENDPOINT));
      blocks.value = parsed ?? [];
      hasFailed.value = !parsed;
    } catch {
      hasFailed.value = true;
    }
  });
  return {
    blocks,
    byType: computed(
      () => new Map(blocks.value.map((block) => [block.type, block])),
    ),
    hasFailed,
  };
}
