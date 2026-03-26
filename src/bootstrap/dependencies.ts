import { createFlashcardsGenerationRunner } from "../agents/flashcards/agent";
import { createNotesGenerationRunner } from "../agents/notes/agent";
import { createStudyLoadParsingRunner } from "../agents/studyloads/agent";
import { FlashcardService } from "../features/flashcards/flashcard.service";
import { NoteService } from "../features/notes/note.service";
import { StudyLoadService } from "../features/studyloads/studyload.service";
import { db } from "../infrastructure/database/client";

export interface AppDependencies {
  flashcardService: FlashcardService;
  noteService: NoteService;
  studyLoadService: StudyLoadService;
}

export function createDependencies(): AppDependencies {
  const flashcardService = new FlashcardService(createFlashcardsGenerationRunner());
  const noteService = new NoteService(createNotesGenerationRunner());
  const studyLoadService = new StudyLoadService(createStudyLoadParsingRunner());

  return {
    flashcardService,
    noteService,
    studyLoadService,
  };
}
