import { eq } from "drizzle-orm";

import { db } from "../../infrastructure/database/client";
import { smartQuizGenerationJobsTable, type SmartQuizGenerationJobRow } from "../../infrastructure/database/schema";
import type { SmartQuizHydrationStatus } from "./smart-quiz.dto";

interface CreateSmartQuizGenerationJobInput {
  generationJobSqid: string;
  requestedCount: number;
  sourceMetadata: unknown;
  hydrationStatus: SmartQuizHydrationStatus;
  draftsJson: unknown;
  warningsJson: unknown;
  errorsJson: unknown;
}

interface UpdateSmartQuizGenerationJobInput {
  hydrationStatus: SmartQuizHydrationStatus;
  draftsJson: unknown;
  warningsJson: unknown;
  errorsJson: unknown;
}

export class SmartQuizGenerationJobRepository {
  async create(input: CreateSmartQuizGenerationJobInput): Promise<SmartQuizGenerationJobRow> {
    const [row] = await db.insert(smartQuizGenerationJobsTable)
      .values({
        generationJobSqid: input.generationJobSqid,
        requestedCount: input.requestedCount,
        sourceMetadata: input.sourceMetadata,
        hydrationStatus: input.hydrationStatus,
        draftsJson: input.draftsJson,
        warningsJson: input.warningsJson,
        errorsJson: input.errorsJson,
      })
      .returning();

    return row;
  }

  async findBySqid(generationJobSqid: string): Promise<SmartQuizGenerationJobRow | null> {
    const [row] = await db.select()
      .from(smartQuizGenerationJobsTable)
      .where(eq(smartQuizGenerationJobsTable.generationJobSqid, generationJobSqid))
      .limit(1);

    return row ?? null;
  }

  async updateBySqid(
    generationJobSqid: string,
    input: UpdateSmartQuizGenerationJobInput,
  ): Promise<SmartQuizGenerationJobRow | null> {
    const [row] = await db.update(smartQuizGenerationJobsTable)
      .set({
        hydrationStatus: input.hydrationStatus,
        draftsJson: input.draftsJson,
        warningsJson: input.warningsJson,
        errorsJson: input.errorsJson,
        updatedAt: new Date(),
      })
      .where(eq(smartQuizGenerationJobsTable.generationJobSqid, generationJobSqid))
      .returning();

    return row ?? null;
  }
}
