import { AppError } from "./app-error";

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, "NOT_FOUND", 404);
    this.name = "NotFoundError";
  }
}
