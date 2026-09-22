import axios, { type AxiosInstance } from "axios";

const API_BASE_URL_ENV = "TEST_API_BASE_URL";

export function publishApiBaseUrl(baseUrl: string): void {
  process.env[API_BASE_URL_ENV] = baseUrl;
}

export function getBaseUrl(): string {
  const baseUrl = process.env[API_BASE_URL_ENV];
  if (!baseUrl) {
    throw new Error(
      `${API_BASE_URL_ENV} is unset: the api-endpoint test module publishes it once the api has reserved its port.`,
    );
  }
  return baseUrl;
}

export function createClient(): AxiosInstance {
  const client = axios.create({
    validateStatus: () => true,
    headers: {
      "x-antelopejs-namespace": "default",
    },
  });
  // Resolved per request rather than at creation, so a client built before the
  // runtime has booted still reaches the api it started.
  client.interceptors.request.use((request) => {
    request.baseURL = getBaseUrl();
    return request;
  });
  return client;
}
