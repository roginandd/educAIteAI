import { eq } from "drizzle-orm";

import type { Database } from "../../infrastructure/database/client";
import { usersTable } from "../../infrastructure/database/schema";
import type { CreateUserInput } from "./user.dto";
import type { User } from "./user.entity";

export class UserRepository {
  constructor(private readonly db: Database) {}

  async findById(userId: string): Promise<User | null> {
    const [row] = await this.db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);

    return row ? mapUserRow(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const [row] = await this.db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);

    return row ? mapUserRow(row) : null;
  }

  async create(input: CreateUserInput): Promise<User> {
    const [row] = await this.db
      .insert(usersTable)
      .values({
        email: input.email,
        displayName: input.displayName,
      })
      .returning();

    return mapUserRow(row);
  }
}

function mapUserRow(row: typeof usersTable.$inferSelect): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
