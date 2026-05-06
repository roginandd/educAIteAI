# Location-First AI Note and Flashcard — Implementation Checklist

## Slice 1: Domain Contract Alignment (ownership + provenance)

- [ ] Confirm `Flashcard` write path requires `DeckId` for all new records.
- [ ] Confirm `SourceNoteId` and `SourceDocumentId` are treated as provenance metadata only.
- [ ] Remove/disable any note-owned flashcard creation path in new writes.
- [ ] Add/adjust DTO/domain types so ownership and provenance semantics are explicit.
- [ ] Document deprecated ownership semantics in code-level migration notes where legacy adapters exist.

## Slice 2: Destination Resolver Capability

- [ ] Implement/confirm application-level destination resolver service.
- [ ] Validate selected `majorDeckSqid` / `deckSqid` belongs to caller workspace context.
- [ ] Support intents:
  - [ ] existing major + existing subdeck
  - [ ] existing major + create subdeck
  - [ ] create major + create subdeck
- [ ] Implement major-only fallback to auto-create default subdeck named `From {NoteTitle}` with collision-safe suffixing.
- [ ] Resolver response contract returns `majorDeckSqid`, `deckSqid`, and `createdNew` flags.

## Slice 3: Resolve-Target API Endpoint

- [ ] Add `POST /api/flashcards/notes/{noteSqid}/resolve-target-deck`.
- [ ] Validate request schema for location intent (existing/create combinations).
- [ ] Wire endpoint to destination resolver and ownership checks.
- [ ] Return normalized response model expected by UI (`majorDeckSqid`, `deckSqid`, `createdNew`).
- [ ] Add integration coverage for each location intent and authorization failure cases.

## Slice 4: AI Note Creation (location-first enforcement)

- [ ] Update `POST /api/notes/ai/create` contract to require destination input before generation.
- [ ] Resolve/create destination before AI generation execution.
- [ ] Persist generated note in selected destination context.
- [ ] Ensure response includes destination identifiers for downstream flashcard flow.
- [ ] Block/save error path if destination cannot be resolved.

## Slice 5: AI Flashcard Preview from Note

- [ ] Add/update `POST /api/flashcards/notes/{noteSqid}/ai/generate-preview`.
- [ ] Enforce resolved destination input (or resolver reference) before preview generation.
- [ ] Return editable draft flashcards only (no canonical persistence in preview step).
- [ ] Include source provenance hints in preview payload where available.
- [ ] Keep AI orchestration through existing task client/service.

## Slice 6: Save Generated Flashcards to Deck

- [ ] Add/update `POST /api/decks/{deckSqid}/flashcards/generated`.
- [ ] Accept selected draft payload from preview step.
- [ ] Persist canonical deck-owned flashcards with required `DeckId`.
- [ ] Persist optional provenance fields: `SourceNoteId`, `SourceDocumentId`.
- [ ] Reject saves when `deckSqid` is unresolved or unauthorized.

## Slice 7: Session and Performance Compatibility

- [ ] Verify created flashcards are queryable by deck-scoped flashcard session flow.
- [ ] Verify compatibility with `StudentFlashcard` and `FlashcardAnswerHistory` performance tracking.
- [ ] Ensure no legacy note/document ownership assumptions are used in session queries.

## Slice 8: Legacy Adapter + Rollout Safety

- [ ] Keep temporary compatibility routes/adapters for frontend dependencies.
- [ ] Route legacy write paths through destination-first resolver where feasible.
- [ ] Mark legacy ownership fields/contracts as deprecated in API docs/comments.
- [ ] Define cutover condition: all flashcard writes are destination-first + deck-owned.

## Slice 9: Validation Against PRD Acceptance Criteria

- [ ] User cannot save generated flashcards without resolved `deckSqid`.
- [ ] Major-only selection auto-creates default subdeck.
- [ ] Saved flashcards are always deck-owned.
- [ ] Saved flashcards retain source note/document provenance when available.
- [ ] AI note creation and flashcard generation both enforce location-first rule.
- [ ] Workspace and deck listings reflect new content immediately.
