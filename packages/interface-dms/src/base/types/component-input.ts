import type { Component } from "../../component";

/**
 * Component or 'noInput' literal
 */
export type ComponentOrNoInput<T = undefined> = Component<T> | "noInput";
