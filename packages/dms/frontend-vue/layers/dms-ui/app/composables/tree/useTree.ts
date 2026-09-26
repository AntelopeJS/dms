const Events = TreeEvents;
const LAZY_LOAD_TRAILING_ICON = "i-lucide-chevron-down";

function mapTreeNodes<T>(
  nodes: TreeNode<T>[],
  transformFn: (node: TreeNode<T>, parentPath: string) => TreeNode<T>,
  parentPath = "",
): TreeNode<T>[] {
  if (!nodes) return [];
  return nodes.map((node) => {
    const transformed = transformFn(node, parentPath);
    const nodePath = parentPath ? `${parentPath}.${node.value}` : node.value;
    if (transformed.children) {
      transformed.children = mapTreeNodes(
        transformed.children,
        transformFn,
        nodePath,
      );
    }
    return transformed;
  });
}

function getNodeId<T>(node: TreeNode<T>): string {
  return node.hierarchicalPath || node.value || "";
}

function findParentPath<T>(
  nodes: TreeNode<T>[],
  targetValue: string,
  currentPath: string[] = [],
): string[] | null {
  for (const node of nodes) {
    const nodeId = getNodeId(node);

    if (node.value === targetValue) return currentPath;

    if (node.children) {
      const found = findParentPath(node.children, targetValue, [
        ...currentPath,
        nodeId,
      ]);
      if (found) return found;
    }
  }
  return null;
}

function processTreeNodesI18n<T>(
  itemsList: TreeNode<T>[],
  processI18n: (key: string) => string,
): TreeNode<T>[] {
  return mapTreeNodes(itemsList, (node) => ({
    ...node,
    label: processI18n(node.label || ""),
  }));
}

function wrapItemsWithTrailingIcon<T>(itemsList: TreeNode<T>[]): TreeNode<T>[] {
  return mapTreeNodes(itemsList, (node) => {
    const iconNode = { ...node };
    if (iconNode.lazyLoadUrl && !iconNode.trailingIcon) {
      iconNode.trailingIcon = LAZY_LOAD_TRAILING_ICON;
    }
    return iconNode;
  });
}

function expandSelectedAncestors<T>(
  newSelected: TreeNode<T> | TreeNode<T>[] | undefined,
  items: TreeNode<T>[],
  expandedNodes: Ref<Set<string>>,
): void {
  if (!newSelected || !items.length) return;

  const selectedValues: string[] = Array.isArray(newSelected)
    ? newSelected.map((n) => n.value).filter((v): v is string => Boolean(v))
    : newSelected.value
      ? [newSelected.value]
      : [];

  selectedValues.forEach((value) => {
    const parentPath = findParentPath(items, value);
    if (parentPath) {
      parentPath.forEach((parentId) => expandedNodes.value.add(parentId));
    }
  });
}

export async function useTree<T = unknown>(props: TreeProps) {
  const { $authFetch } = useAuthFetch();
  const { sendComponentEvent } = useComponentEvent(props.componentId);
  const { getFunction } = useDefinedFunctions();
  const { processI18n } = useTranslation();
  const { isLoading: watchLoading, state: watchState } = useWatch(
    props.watchActions || [],
  );
  const toast = useToast();
  const { t } = useI18n();

  const { execute: executeLazyLoad } = useEventedAction<TreeNode<T>[]>({
    componentId: props.componentId,
    events: {
      start: TreeEvents.LAZY_LOAD,
      success: TreeEvents.LAZY_LOAD_SUCCESS,
    },
  });

  const loadingNodes = ref<Set<string>>(new Set());
  // Shallow on purpose: `TreeItem` carries a string index signature and
  // recurses through `children`, so Vue's deep `UnwrapRef` on a tree node
  // never terminates for the type checker. Selection is always replaced as a
  // whole, never mutated in place, so shallow reactivity is enough.
  const selected: Ref<TreeNode<T> | TreeNode<T>[] | undefined> = shallowRef(
    props.modelValue as TreeNode<T> | TreeNode<T>[] | undefined,
  );
  const expandedNodes = ref<Set<string>>(new Set(props.defaultExpanded || []));

  const wrapItemsWithEvents = (
    itemsList: TreeNode<T>[],
    parentPath = "",
  ): TreeNode<T>[] =>
    mapTreeNodes(
      itemsList,
      (node, path) => {
        if (import.meta.env.DEV && !node.value) {
          createError({
            message:
              'TreeNode is missing a "value" property. All nodes must have a value to generate unique hierarchical paths.',
            data: node,
          });
        }

        const wrappedNode = { ...node };
        const nodePath = path ? `${path}.${node.value}` : node.value;
        wrappedNode.hierarchicalPath = nodePath;
        wrappedNode.onToggle = (e: Event) => handleNodeToggle(wrappedNode, e);
        wrappedNode.onSelect = (e: Event) => handleNodeSelect(wrappedNode, e);

        return wrappedNode;
      },
      parentPath,
    );

  async function fetchLazyChildren(node: TreeNode<T>): Promise<TreeNode<T>[]> {
    const children = await executeLazyLoad(
      () =>
        $authFetch<TreeNode<T>[]>(node.lazyLoadUrl!, {
          method: props.fetchUrlMethod || "GET",
        }),
      {
        startPayload: { node, url: node.lazyLoadUrl },
        successPayload: (c) => ({ node, childrenCount: c.length }),
      },
    );
    const parentPath = node.hierarchicalPath || node.value || "";
    return wrapItemsWithEvents(
      processTreeNodesI18n(children, processI18n),
      parentPath,
    );
  }

  async function loadNodeChildren(node: TreeNode<T>): Promise<boolean> {
    if (!props.lazyLoad || !node.lazyLoadUrl || node.children?.length) {
      return true;
    }

    const nodeId = getNodeId(node);
    loadingNodes.value.add(nodeId);
    node.isLoading = true;

    try {
      node.children = await fetchLazyChildren(node);
      node.hasChildren = node.children.length > 0;
      return true;
    } catch {
      node.hasChildren = true;
      node.children = [];
      toast.add({
        color: Color.error,
        title: t("dms.tree.load_error_title"),
        description: t("dms.tree.load_error_message"),
      });
      return false;
    } finally {
      node.isLoading = false;
      loadingNodes.value.delete(nodeId);
    }
  }

  // A tree with neither a URL nor nodes of its own holds nothing yet, which is
  // what a block just placed on a page looks like: it is configured after it is
  // placed, and the editor says what is still missing. Refusing to render at
  // all would answer that gesture with a crash.
  const dataLoader = props.fetchUrl
    ? () =>
        $authFetch<TreeNode<T>[]>(props.fetchUrl!, {
          method: props.fetchUrlMethod || "GET",
        })
    : () => Promise.resolve((props.staticNodes ?? []) as TreeNode<T>[]);

  const { data, status, refresh } = await useDmsAsyncData(
    `tree-${props.componentId}-${props.pageId}-${props.componentId}`,
    () =>
      dataLoader().then((data) =>
        processTreeNodesI18n(wrapItemsWithTrailingIcon(data), processI18n),
      ),
    { watch: props.fetchUrl ? [() => props.fetchUrl] : [] },
  );

  const items = computed<TreeNode<T>[]>(() => data.value || []);
  const loading = computed(
    () => status.value === "pending" || watchLoading.value,
  );
  const itemsRef = computed(() => wrapItemsWithEvents(items.value));

  watch(
    selected,
    (newSelected) =>
      expandSelectedAncestors(
        newSelected as TreeNode<T> | TreeNode<T>[] | undefined,
        items.value,
        expandedNodes,
      ),
    { deep: true, immediate: true },
  );

  async function triggerToggleFunction(node: TreeNode<T>): Promise<boolean> {
    if (!props.nodeToggleFunctionId) return true;
    const func = getFunction(props.nodeToggleFunctionId);
    if (!func) return true;
    try {
      await func(node);
      return true;
    } catch {
      return false;
    }
  }

  async function expandLazyNode(
    node: TreeNode<T>,
    nodeId: string,
  ): Promise<boolean> {
    const loadSuccess = await loadNodeChildren(node);
    if (!loadSuccess) return false;

    expandedNodes.value.add(nodeId);
    sendComponentEvent(Events.NODE_EXPAND, props.componentId, { node });
    sendComponentEvent(Events.NODE_TOGGLE, props.componentId, {
      node,
      expanded: true,
    });
    return true;
  }

  const handleNodeToggle = async (node: TreeNode<T>, e: Event) => {
    if (!isUndefined(node.expandable) && !node.expandable) {
      e.preventDefault();
      return;
    }

    const nodeId = getNodeId(node);
    if (!nodeId) return;

    const wasExpanded = expandedNodes.value.has(nodeId);
    const needsLazyLoad =
      props.lazyLoad &&
      node.hasChildren &&
      !node.children?.length &&
      !wasExpanded;

    if (needsLazyLoad) {
      e.preventDefault();
      await expandLazyNode(node, nodeId);
      return;
    }

    if (!(await triggerToggleFunction(node))) {
      e.preventDefault();
      return;
    }

    const event = wasExpanded ? Events.NODE_COLLAPSE : Events.NODE_EXPAND;
    if (wasExpanded) expandedNodes.value.delete(nodeId);
    else expandedNodes.value.add(nodeId);

    sendComponentEvent(event, props.componentId, { node });
    sendComponentEvent(Events.NODE_TOGGLE, props.componentId, {
      node,
      expanded: !wasExpanded,
    });
  };

  async function triggerSelectFunction(node: TreeNode<T>): Promise<boolean> {
    if (!props.nodeSelectFunctionId) return true;
    const func = getFunction(props.nodeSelectFunctionId);
    if (!func) return true;
    try {
      await func(node);
      return true;
    } catch {
      return false;
    }
  }

  const handleNodeSelect = async (node: TreeNode<T>, e: Event) => {
    if (!isUndefined(node.selectable) && !node.selectable) {
      e.preventDefault();
      return;
    }

    if (!(await triggerSelectFunction(node))) {
      e.preventDefault();
      return;
    }

    sendComponentEvent(Events.NODE_SELECT, props.componentId, { node });
  };

  const isAnyNodeLoading = computed(() => loadingNodes.value.size > 0);

  return {
    loading,
    loadingNodes,
    expandedNodes,
    isAnyNodeLoading,
    items,
    itemsRef,
    selected,
    refresh,
    loadNodeChildren,
    watchState,
  };
}
