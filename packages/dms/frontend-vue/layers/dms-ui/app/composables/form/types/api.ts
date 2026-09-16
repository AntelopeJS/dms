import type { FormData } from "./value";

export interface FormFetchResponse extends FormData {}

export interface FormSubmitResponse {
  success?: boolean;
  message?: string;
}
