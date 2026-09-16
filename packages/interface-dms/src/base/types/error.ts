import { isNull, isObject } from "../../utils/type-check";

/**
 * Error with a message property
 */
export interface ErrorWithMessage {
  message: string;
}

/**
 * Type guard to check if an error has a message
 */
export function isErrorWithMessage(error: unknown): error is ErrorWithMessage {
  return isObject(error) && !isNull(error) && "message" in error;
}

/**
 * Get error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (isErrorWithMessage(error)) {
    return error.message;
  }
  return "Unknown error";
}
