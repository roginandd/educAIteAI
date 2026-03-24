import type { ToolDefinition } from "../../shared/types/tool-definition";
import { createUserInputSchema, getUserByIdInputSchema } from "./user.dto";
import { createUserResponseSchema, getUserByIdResponseSchema } from "./user.response";
import type { UserService } from "./user.service";

export function buildUserTools(userService: UserService): ToolDefinition[] {
  return [
    {
      name: "get_user_by_id",
      description: "Fetch a single user by id.",
      inputSchema: getUserByIdInputSchema,
      async execute(input) {
        const user = await userService.getUserById(input.userId);
        return getUserByIdResponseSchema.parse(user);
      },
    },
    {
      name: "create_user",
      description: "Create a new user.",
      inputSchema: createUserInputSchema,
      async execute(input) {
        const user = await userService.createUser(input);
        return createUserResponseSchema.parse(user);
      },
    },
  ];
}
