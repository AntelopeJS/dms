interface UseTableViewExportOptions {
  componentId?: string;
}

export const useTableViewExport = (options: UseTableViewExportOptions = {}) => {
  const { runJob } = useExportJob();

  const exportAction = useEventedAction<unknown>({
    componentId: options.componentId,
    events: {
      start: TableViewEvents.EXPORT,
      success: TableViewEvents.EXPORT_SUCCESS,
      error: TableViewEvents.EXPORT_ERROR,
    },
  });

  async function exportTable(
    location: string,
    queryRequest: TableQueryParams,
    ids?: string[],
  ) {
    const query =
      ids && ids.length > 0 ? { ...queryRequest, ids } : queryRequest;
    await exportAction.execute(
      () =>
        runJob({
          startUrl: `${location}/export/start`,
          startMethod: "GET",
          startQuery: query as Record<string, unknown>,
          statusUrl: (ticket) => `${location}/export/status/${ticket.jobId}`,
          downloadUrl: (ticket) =>
            `${location}/export/download/${ticket.jobId}`,
        }),
      {
        startPayload: { query: queryRequest, ids },
        successPayload: () => ({ query: queryRequest, ids }),
        errorPayload: (error) => ({
          query: queryRequest,
          ids,
          error:
            (error as { data?: string; message?: string })?.data ||
            (error as Error)?.message,
        }),
      },
    );
  }

  return { exportTable };
};
