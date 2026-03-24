import { z } from "zod";

export const getUserByIdInputSchema = z.object({
  userId: z.string().uuid(),
});

export const createUserInputSchema = z.object({
  email: z.string().trim().email(),
  displayName: z.string().trim().min(2).max(120),
});

export type GetUserByIdInput = z.output<typeof getUserByIdInputSchema>;
export type CreateUserInput = z.output<typeof createUserInputSchema>;
