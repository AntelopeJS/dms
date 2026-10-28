export type RealtimeDriver = "redis" | "memory" | "auto";

export interface RealtimeConfig {
  driver?: RealtimeDriver;
}
