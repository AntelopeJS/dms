export enum HttpMethod {
  get = "GET",
  post = "POST",
  put = "PUT",
  delete = "DELETE",
  patch = "PATCH",
  head = "HEAD",
  options = "OPTIONS",
}

export interface QueryParams {
  [key: string]: string | number | boolean | string[] | number[];
}

export interface EventError {
  data?: string;
  message?: string;
}
