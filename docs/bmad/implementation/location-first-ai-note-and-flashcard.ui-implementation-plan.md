# Location-First AI Note and Flashcard — UI Implementation Plan

## Scope

Deliver a destination-first UX for AI note and flashcard creation where users choose location first, preview/edit generated content, and save into a resolved deck target.

## Slice 1: UX Entry and Flow Guardrails

- [ ] Update "Create with AI" entry points to require location selection before generation.
- [ ] Add route/state guards so generation actions are disabled until destination is resolved.
- [ ] Ensure both note and flashcard flows use the same location-first sequence.

## Slice 2: Location Picker Experience

- [ ] Implement location selector with three intents:
  - [ ] existing major + existing subdeck
  - [ ] existing major + create subdeck
  - [ ] create major + create subdeck
- [ ] Support major-only user selection with clear UI messaging that a default subdeck will be created.
- [ ] Provide inline validation and actionable errors for missing/invalid inputs.

## Slice 3: Destination Resolution Integration

- [ ] Integrate `POST /api/flashcards/notes/{noteSqid}/resolve-target-deck`.
- [ ] Persist resolved `majorDeckSqid` and `deckSqid` in local flow state.
- [ ] Handle `createdNew` response flags for confirmation UX.
- [ ] Block progression when resolution fails and surface retry paths.

## Slice 4: Create Note with AI UI Flow

- [ ] Update create-note UI to submit location input first to backend.
- [ ] Display loading/progress state during AI generation.
- [ ] Render generated note with edit capability before final save/confirm.
- [ ] Persist and display destination context in success state.

## Slice 5: Generate Flashcard Preview UI Flow

- [ ] Integrate `POST /api/flashcards/notes/{noteSqid}/ai/generate-preview`.
- [ ] Show editable draft flashcards in preview screen.
- [ ] Allow select/deselect and per-card edits prior to save.
- [ ] Ensure preview step never appears as persisted content.

## Slice 6: Save Generated Flashcards UI Flow

- [ ] Integrate `POST /api/decks/{deckSqid}/flashcards/generated`.
- [ ] Submit only selected/edited drafts.
- [ ] Prevent save when `deckSqid` is missing/unresolved.
- [ ] Show clear confirmation including destination major deck/subdeck.

## Slice 7: Listing Consistency and Refresh

- [ ] Refresh workspace-major-deck-deck views immediately after note creation/save.
- [ ] Refresh deck flashcard listings immediately after generated flashcard save.
- [ ] Ensure newly created major/subdeck entries appear without manual reload.

## Slice 8: Error States, Empty States, and UX Quality

- [ ] Handle resolver authorization/ownership errors with specific copy.
- [ ] Handle AI generation failures with retry and state preservation.
- [ ] Handle partial-save or validation errors without losing user draft edits.
- [ ] Confirm accessibility for selection, preview editing, and confirmation screens.

## Slice 9: UI Acceptance Gate

- [ ] User cannot trigger save generated flashcards without resolved destination.
- [ ] Major-only selection clearly results in default subdeck creation behavior.
- [ ] Flow remains: entry -> location -> resolve -> generate -> review/edit -> save -> confirm.
- [ ] Destination and saved items are reflected immediately in UI listings.

