# Code Flashcard Test Case Contract

## Applies To
- `Algorithm`
- `Debugging`

## Generation Rule
- Total test cases = `visibleTestCases + hiddenTestCases`.
- Generate as many relevant source-grounded test cases as the material supports.
- Prefer visible test cases for core behavior.
- Additional edge-case coverage may be placed in `hiddenTestCases`.

## Output Contract
- `visibleTestCases` must be an array.
- `hiddenTestCases` may be omitted, but when present it must be an array.
- Every test case entry must be an object.
- Every test case object must use these exact keys:
  - `name`
  - `input`
  - `expectedOutput`

## Generation Constraint
- `Algorithm` and `Debugging` items must always generate concrete object-shaped test cases grounded in the source material.
