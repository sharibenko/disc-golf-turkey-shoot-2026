# Remove email entry from the scoring desk

Branch: `codex/scoring-desk-remove-email`

## Goal

Allow name-only signup without losing saved rounds, throw corrections, round numbering, or best-score grouping on either leaderboard. Preserve email values already stored for existing players.

## Findings

- Signup currently requires name and email.
- Email currently links a player's rounds for numbering and best-score selection.
- The deployed Apps Script rejects participants with an empty email. Removing only the input would therefore lose new signups when saving.

## Implementation plan

1. Introduce a stable player identifier separate from the round identifier. Carry it into subsequent rounds and use it for round numbering and best-score grouping. Preserve existing email-based grouping for historical records and keep unrelated players separate, including players with identical names.
2. Update Apps Script sanitization and stored state to preserve player identifiers and accept participants without email. Keep historical email data and existing sheet columns compatible. Deploy this compatible backend update before enabling name-only signup.
3. Remove the email input and its required validation. Keep the player-name field and add button together. Hide empty email lines in the queue. Continue additional rounds through the existing “Start another round” action so they retain the player's identifier.
4. Verify name-only signup survives saving and reloading; subsequent rounds remain linked; duplicate names remain independent; historical records retain their grouping; and editing any throw overwrites the same saved round. Check both leaderboards choose the correct best round.
5. Run the production build and relevant tests, preview locally, then publish the scoring desk and both leaderboards together after the backend compatibility change is deployed.

## Scope

Remove email collection from the scoring desk. Do not erase historical email data or change scoring rules.

## Status

Implementation ready for local testing on port 3001 using isolated browser storage. Identity/scoring tests and TypeScript checks pass. Production build and all 10 tests pass. Backend deployment and publication remain pending: the available Google account does not show the event Apps Script project. Deploy the updated Code.gs to the existing event web-app deployment before publishing the frontend.
