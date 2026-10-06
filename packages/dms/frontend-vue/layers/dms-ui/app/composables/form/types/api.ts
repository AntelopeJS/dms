import type { FormData } from "./value";
import type { WarningResponse } from "../../../build/utils/responseWarning";

export interface FormFetchResponse extends FormData {}

export interface FormSubmitResponse extends WarningResponse {
  success?: boolean;
  message?: string;
}
