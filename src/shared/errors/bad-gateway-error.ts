import { AppError } from "./app-error";

export class BadGatewayError extends AppError {
  constructor(message: string) {
    super(message, "BAD_GATEWAY", 502);
    this.name = "BadGatewayError";
  }
}
