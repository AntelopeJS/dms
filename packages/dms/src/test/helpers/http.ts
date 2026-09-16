import axios, { type AxiosInstance } from "axios";

const DEFAULT_BASE_URL = "http://127.0.0.1:5010";

export function getBaseUrl(): string {
  return process.env.TEST_API_BASE_URL ?? DEFAULT_BASE_URL;
}

export function createClient(): AxiosInstance {
  return axios.create({
    baseURL: getBaseUrl(),
    validateStatus: () => true,
    headers: {
      "x-antelopejs-namespace": "default",
    },
  });
}
