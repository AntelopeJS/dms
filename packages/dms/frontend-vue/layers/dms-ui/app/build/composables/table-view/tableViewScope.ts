import type {
  TableViewScopeReaders,
  TableViewScopeResults,
} from "./tableViewScopeResults";
import type { TableViewDeferred } from "./tableViewDeferred";
import type { TableViewSetupProps } from "./tableViewTypes";
export class TableViewScope<T extends Data> {
  readonly deferred: TableViewDeferred<T>;
  constructor(
    readonly props: TableViewSetupProps<T>,
    private readonly read: TableViewScopeReaders<T>,
  ) {
    this.deferred = {
      get activeViewId() {
        return read.views().activeViewId;
      },
      get activeTabId() {
        return read.tabs().activeTabId;
      },
      get columnFilters() {
        return read.filterState().columnFilters;
      },
      get sorting() {
        return read.defaultSorting().sorting;
      },
      get defaultSortState() {
        return read.defaultSorting().defaultSortState;
      },
      get paginationState() {
        return read.urlFilters().paginationState;
      },
      get DEFAULT_PAGINATION() {
        return read.displayPreferences().DEFAULT_PAGINATION;
      },
      get router() {
        return read.quickActions().router;
      },
      get isGroupedDisplay() {
        return read.querySorting().isGroupedDisplay;
      },
      get liveGate() {
        return read.refresh().liveGate;
      },
      get data() {
        return read.listState().data;
      },
      get refreshCounts() {
        return read.refresh().refreshCounts;
      },
      get recordLink() {
        return read.recordLink().recordLink;
      },
      get selectedIds() {
        return read.displaySelection().selectedIds;
      },
      get handleExportTable() {
        return read.rowOpen().handleExportTable;
      },
      get displayContext() {
        return read.displayContext().displayContext;
      },
    };
  }
  get configuration(): TableViewScopeResults<T>["configuration"] {
    return this.read.configuration();
  }
  get arrival(): TableViewScopeResults<T>["arrival"] {
    return this.read.arrival();
  }
  get displayOptions(): TableViewScopeResults<T>["displayOptions"] {
    return this.read.displayOptions();
  }
  get displayComponent(): TableViewScopeResults<T>["displayComponent"] {
    return this.read.displayComponent();
  }
  get displayPreferences(): TableViewScopeResults<T>["displayPreferences"] {
    return this.read.displayPreferences();
  }
  get urlFilters(): TableViewScopeResults<T>["urlFilters"] {
    return this.read.urlFilters();
  }
  get groupingOptions(): TableViewScopeResults<T>["groupingOptions"] {
    return this.read.groupingOptions();
  }
  get defaultSorting(): TableViewScopeResults<T>["defaultSorting"] {
    return this.read.defaultSorting();
  }
  get pinnedFilters(): TableViewScopeResults<T>["pinnedFilters"] {
    return this.read.pinnedFilters();
  }
  get filterState(): TableViewScopeResults<T>["filterState"] {
    return this.read.filterState();
  }
  get views(): TableViewScopeResults<T>["views"] {
    return this.read.views();
  }
  get tabs(): TableViewScopeResults<T>["tabs"] {
    return this.read.tabs();
  }
  get rows(): TableViewScopeResults<T>["rows"] {
    return this.read.rows();
  }
  get quickFilters(): TableViewScopeResults<T>["quickFilters"] {
    return this.read.quickFilters();
  }
  get queryFilters(): TableViewScopeResults<T>["queryFilters"] {
    return this.read.queryFilters();
  }
  get querySorting(): TableViewScopeResults<T>["querySorting"] {
    return this.read.querySorting();
  }
  get query(): TableViewScopeResults<T>["query"] {
    return this.read.query();
  }
  get liveHold(): TableViewScopeResults<T>["liveHold"] {
    return this.read.liveHold();
  }
  get listState(): TableViewScopeResults<T>["listState"] {
    return this.read.listState();
  }
  get sortRecovery(): TableViewScopeResults<T>["sortRecovery"] {
    return this.read.sortRecovery();
  }
  get listPagination(): TableViewScopeResults<T>["listPagination"] {
    return this.read.listPagination();
  }
  get countsQuery(): TableViewScopeResults<T>["countsQuery"] {
    return this.read.countsQuery();
  }
  get countsData(): TableViewScopeResults<T>["countsData"] {
    return this.read.countsData();
  }
  get footer(): TableViewScopeResults<T>["footer"] {
    return this.read.footer();
  }
  get rowNavigation(): TableViewScopeResults<T>["rowNavigation"] {
    return this.read.rowNavigation();
  }
  get rowLocator(): TableViewScopeResults<T>["rowLocator"] {
    return this.read.rowLocator();
  }
  get reorder(): TableViewScopeResults<T>["reorder"] {
    return this.read.reorder();
  }
  get grouping(): TableViewScopeResults<T>["grouping"] {
    return this.read.grouping();
  }
  get linkCounts(): TableViewScopeResults<T>["linkCounts"] {
    return this.read.linkCounts();
  }
  get refresh(): TableViewScopeResults<T>["refresh"] {
    return this.read.refresh();
  }
  get tabPresentation(): TableViewScopeResults<T>["tabPresentation"] {
    return this.read.tabPresentation();
  }
  get rowActions(): TableViewScopeResults<T>["rowActions"] {
    return this.read.rowActions();
  }
  get bulkSelection(): TableViewScopeResults<T>["bulkSelection"] {
    return this.read.bulkSelection();
  }
  get rowCommands(): TableViewScopeResults<T>["rowCommands"] {
    return this.read.rowCommands();
  }
  get rowOpen(): TableViewScopeResults<T>["rowOpen"] {
    return this.read.rowOpen();
  }
  get rowRealtime(): TableViewScopeResults<T>["rowRealtime"] {
    return this.read.rowRealtime();
  }
  get presenceState(): TableViewScopeResults<T>["presenceState"] {
    return this.read.presenceState();
  }
  get presenceEvents(): TableViewScopeResults<T>["presenceEvents"] {
    return this.read.presenceEvents();
  }
  get expansion(): TableViewScopeResults<T>["expansion"] {
    return this.read.expansion();
  }
  get expandedDetails(): TableViewScopeResults<T>["expandedDetails"] {
    return this.read.expandedDetails();
  }
  get rowEdit(): TableViewScopeResults<T>["rowEdit"] {
    return this.read.rowEdit();
  }
  get recordLink(): TableViewScopeResults<T>["recordLink"] {
    return this.read.recordLink();
  }
  get displaySelection(): TableViewScopeResults<T>["displaySelection"] {
    return this.read.displaySelection();
  }
  get displayActions(): TableViewScopeResults<T>["displayActions"] {
    return this.read.displayActions();
  }
  get displayContext(): TableViewScopeResults<T>["displayContext"] {
    return this.read.displayContext();
  }
  get quickActions(): TableViewScopeResults<T>["quickActions"] {
    return this.read.quickActions();
  }
}
