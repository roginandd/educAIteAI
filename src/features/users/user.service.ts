import { ConflictError } from "../../shared/errors/conflict-error";
import { NotFoundError } from "../../shared/errors/not-found-error";
import type { CreateUserInput } from "./user.dto";
import type { User } from "./user.entity";
import { UserRepository } from "./user.repository";

export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  async getUserById(userId: string): Promise<User> {
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new NotFoundError(`User ${userId} was not found.`);
    }

    return user;
  }

  async createUser(input: CreateUserInput): Promise<User> {
    const existingUser = await this.userRepository.findByEmail(input.email);

    if (existingUser) {
      throw new ConflictError(`User with email ${input.email} already exists.`);
    }

    return this.userRepository.create(input);
  }
}
