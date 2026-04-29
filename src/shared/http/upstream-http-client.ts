import { AppError } from "../errors/app-error";
import { BadGatewayError } from "../errors/bad-gateway-error";

export class UpstreamHttpClient {
  constructor(private readonly baseUrl: string) {}

  async getJson(pathOrUrl: string, init: RequestInit, fallbackMessage: string): Promise<unknown> {
    const response = await this.request(pathOrUrl, init, fallbackMessage);
    return this.parseJsonResponse(response, fallbackMessage);
  }

  async getJsonOrNullOnStatus(
    pathOrUrl: string,
    init: RequestInit,
    fallbackMessage: string,
    nullStatuses: number[],
  ): Promise<unknown | null> {
    const response = await this.request(pathOrUrl, init, fallbackMessage);

    if (nullStatuses.includes(response.status)) {
      return null;
    }

    return this.parseJsonResponse(response, fallbackMessage);
  }

  async expectNoContent(pathOrUrl: string, init: RequestInit, fallbackMessage: string, successStatuses: number[]): Promise<void> {
    const response = await this.request(pathOrUrl, init, fallbackMessage);

    if (successStatuses.includes(response.status)) {
      return;
    }

    await this.parseJsonResponse(response, fallbackMessage);
  }

  async downloadBytes(url: string, fallbackMessage: string, accept = "application/octet-stream"): Promise<Uint8Array> {
    const response = await this.request(url, {
      method: "GET",
      headers: {
        Accept: accept,
      },
    }, fallbackMessage);

    if (!response.ok) {
      throw new BadGatewayError(fallbackMessage);
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      throw new BadGatewayError(fallbackMessage);
    }

    return new Uint8Array(arrayBuffer);
  }

  async downloadBase64(url: string, fallbackMessage: string, accept = "application/octet-stream"): Promise<string> {
    const bytes = await this.downloadBytes(url, fallbackMessage, accept);
    return Buffer.from(bytes).toString("base64");
  }

  async request(pathOrUrl: string, init: RequestInit, fallbackMessage: string): Promise<Response> {
    try {
      return await fetch(this.resolveUrl(pathOrUrl), init);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown network error.";
      throw new BadGatewayError(`${fallbackMessage} ${message}`.trim());
    }
  }

  private resolveUrl(pathOrUrl: string): string {
    if (/^https?:\/\//i.test(pathOrUrl)) {
      return pathOrUrl;
    }

    return `${this.baseUrl}${pathOrUrl}`;
  }

  private async parseJsonResponse(response: Response, fallbackMessage: string): Promise<unknown> {
    const rawBody = await response.text();
    const parsedBody = rawBody ? tryParseJson(rawBody) : null;

    if (!response.ok) {
      const extractedMessage = extractErrorMessage(parsedBody);
      const rawBodyPreview = rawBody.trim();
      const message = extractedMessage
        ?? (rawBodyPreview ? `${fallbackMessage} ${rawBodyPreview}`.trim() : fallbackMessage);
      const code = extractErrorCode(parsedBody) ?? `UPSTREAM_${response.status}`;

      throw new AppError(message, code, response.status);
    }

    if (parsedBody === null) {
      throw new BadGatewayError(fallbackMessage);
    }

    return parsedBody;
  }
}

function extractErrorMessage(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const directMessage = (payload as { message?: unknown }).message;
  if (typeof directMessage === "string" && directMessage.trim()) {
    return directMessage;
  }

  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }

  const error = (payload as { error?: unknown }).error;
  if (typeof error === "string" && error.trim()) {
    return error;
  }

  const nestedError = (payload as { error?: { message?: unknown } }).error?.message;
  if (typeof nestedError === "string" && nestedError.trim()) {
    return nestedError;
  }

  const title = (payload as { title?: unknown }).title;
  if (typeof title === "string" && title.trim()) {
    return title;
  }

  const validationErrors = (payload as { errors?: unknown }).errors;
  if (typeof validationErrors === "object" && validationErrors !== null) {
    for (const value of Object.values(validationErrors)) {
      if (Array.isArray(value)) {
        const firstMessage = value.find((item) => typeof item === "string" && item.trim());
        if (typeof firstMessage === "string") {
          return firstMessage;
        }
      }
    }
  }

  return null;
}

function extractErrorCode(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const code = (payload as { code?: unknown }).code;
  if (typeof code === "string" && code.trim()) {
    return code.trim();
  }

  return null;
}

function tryParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
