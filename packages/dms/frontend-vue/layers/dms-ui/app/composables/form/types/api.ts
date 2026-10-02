import type { FormData } from "./value";
import type { WarningResponse } from "../../../utils/responseWarning";

export interface FormFetchResponse extends FormData {}

export interface FormSubmitResponse extends WarningResponse {
  success?: boolean;
  message?: string;
}
