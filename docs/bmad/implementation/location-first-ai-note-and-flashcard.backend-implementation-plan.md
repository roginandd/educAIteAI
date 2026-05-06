# Location-First AI Note and Flashcard — Backend Implementation Plan

## Scope

Deliver destination-first backend contracts for AI note creation and AI flashcard generation/save, with strict deck ownership and provenance metadata.

## Slice 1: Domain and Contract Hardening

- [ ] Enforce `Flashcard.DeckId` as required on all new write paths.
- [ ] Treat `SourceNoteId` and `SourceDocumentId` as optional provenance only.
- [ ] Remove or block new note-owned flashcard write paths.
- [ ] Update DTOs/responses so ownership vs provenance is explicit.

## Slice 2: Destination Resolver Foundation

- [ ] Implement or confirm a destination resolver service with location intents:
  - [ ] existing major + existing subdeck
  - [ ] existing major + create subdeck
  - [ ] create major + create subdeck
- [ ] Validate workspace ownership and authorization for selected targets.
- [ ] Support major-only fallback by auto-creating subdeck `From {NoteTitle}` with collision-safe suffixing.
- [ ] Return normalized output: `majorDeckSqid`, `deckSqid`, `createdNew`.

## Slice 3: Resolve Target Endpoint

- [ ] Add `POST /api/flashcards/notes/{noteSqid}/resolve-target-deck`.
- [ ] Validate intent payload with schema-level checks.
- [ ] Route through destination resolver and permission checks.
- [ ] Add integration tests for all intent branches and auth failures.

## Slice 4: AI Note Creation Endpoint (Destination-First)

- [ ] Update `POST /api/notes/ai/create` to require destination input.
- [ ] Resolve/create destination before invoking AI generation.
- [ ] Persist generated note in resolved destination context.
- [ ] Include destination identifiers in response for downstream flows.
- [ ] Return explicit failure when destination resolution fails.

## Slice 5: AI Flashcard Preview Endpoint

- [ ] Add/update `POST /api/flashcards/notes/{noteSqid}/ai/generate-preview`.
- [ ] Require resolved destination input or resolver reference.
- [ ] Return drafts only; do not persist canonical flashcards here.
- [ ] Include provenance hints in preview output when available.
- [ ] Keep orchestration via existing AI task client/service.

## Slice 6: Save Generated Flashcards Endpoint

- [ ] Add/update `POST /api/decks/{deckSqid}/flashcards/generated`.
- [ ] Accept selected draft payload from preview.
- [ ] Persist canonical flashcards with required `DeckId`.
- [ ] Persist optional `SourceNoteId` and `SourceDocumentId`.
- [ ] Reject unresolved/unauthorized `deckSqid` requests.

## Slice 7: Session, Performance, and Legacy Safety

- [ ] Confirm compatibility with deck-scoped session flows.
- [ ] Confirm compatibility with `StudentFlashcard` and `FlashcardAnswerHistory`.
- [ ] Remove legacy note/document ownership assumptions in query paths.
- [ ] Keep temporary compatibility adapters for old frontend contracts.
- [ ] Define backend cutover: all writes are destination-first + deck-owned.

## Slice 8: Backend Acceptance Gate

- [ ] No generated flashcard save without resolved `deckSqid`.
- [ ] Major-only target auto-creates default subdeck.
- [ ] Saved flashcards are always deck-owned.
- [ ] Provenance fields are preserved when source note/document exists.
- [ ] Note AI and flashcard AI endpoints both enforce location-first behavior.

