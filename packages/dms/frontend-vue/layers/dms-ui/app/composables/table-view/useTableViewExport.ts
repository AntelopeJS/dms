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
          // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- TableQueryParams lacks the export transport's open index signature; preserve the original query object rather than copy or validate its values.
          startQuery: query as NonNullable<
            Parameters<typeof runJob>[0]["startQuery"]
          >,
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
            // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Rejections are not validated; preserve optional data access and its existing fallback for arbitrary thrown values.
            (error as { data?: string; message?: string })?.data ||
            // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Preserve the unchecked message fallback without claiming the rejection is an Error instance.
            (error as Error)?.message,
        }),
      },
    );
  }

  return { exportTable };
};
