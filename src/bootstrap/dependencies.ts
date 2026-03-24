import { UserRepository } from "../features/users/user.repository";
import { UserService } from "../features/users/user.service";
import { db } from "../infrastructure/database/client";

export interface AppDependencies {
  userRepository: UserRepository;
  userService: UserService;
}

export function createDependencies(): AppDependencies {
  const userRepository = new UserRepository(db);
  const userService = new UserService(userRepository);

  return {
    userRepository,
    userService,
  };
}
