import { z } from "zod";

export const userResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const createUserResponseSchema = userResponseSchema;
export const getUserByIdResponseSchema = userResponseSchema;

export type UserResponse = z.output<typeof userResponseSchema>;
