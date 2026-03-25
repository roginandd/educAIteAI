import { createFlashcardsGenerationRunner } from "../agents/flashcards/agent";
import { createStudyLoadParsingRunner } from "../agents/studyloads/agent";
import { FlashcardService } from "../features/flashcards/flashcard.service";
import { StudyLoadService } from "../features/studyloads/studyload.service";
import { UserRepository } from "../features/users/user.repository";
import { UserService } from "../features/users/user.service";
import { db } from "../infrastructure/database/client";

export interface AppDependencies {
  flashcardService: FlashcardService;
  studyLoadService: StudyLoadService;
  userRepository: UserRepository;
  userService: UserService;
}

export function createDependencies(): AppDependencies {
  const flashcardService = new FlashcardService(createFlashcardsGenerationRunner());
  const studyLoadService = new StudyLoadService(createStudyLoadParsingRunner());
  const userRepository = new UserRepository(db);
  const userService = new UserService(userRepository);

  return {
    flashcardService,
    studyLoadService,
    userRepository,
    userService,
  };
}
