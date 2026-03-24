import { AppError } from "./app-error";

export class UnauthorizedError extends AppError {
  constructor(message = "Authorization header is required.") {
    super(message, "UNAUTHORIZED", 401);
    this.name = "UnauthorizedError";
  }
}
