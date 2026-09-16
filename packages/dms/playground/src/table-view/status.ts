export const TASK_STATUSES = [
  {
    value: "pending",
    label: "Pending",
    icon: "i-ph-clock",
    iconColor: "warning",
    textColor: "warning",
  },
  {
    value: "in_progress",
    label: "In Progress",
    icon: "i-ph-spinner",
    iconColor: "info",
    textColor: "info",
  },
  {
    value: "completed",
    label: "Completed",
    icon: "i-ph-check-circle",
    iconColor: "success",
    textColor: "success",
  },
  {
    value: "cancelled",
    label: "Cancelled",
    icon: "i-ph-x-circle",
    iconColor: "error",
    textColor: "error",
  },
] as const;

export type TaskStatusValue = (typeof TASK_STATUSES)[number]["value"];
