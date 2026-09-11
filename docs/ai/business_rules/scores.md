# Business Rules: High Scores & Leaderboard Engine

This document describes the score submission lifecycle, test vs. live score quarantine, automatic score clearing, session verification, and anti-cheat validation in **Event Game Studio**, verified against `server/db/highScores.ts` and `server/db/events.ts`.

---

## 1. Test vs. Live Score Environments

The platform enforces strict physical quarantine between test rehearsal scores and public competition scores:

```
[ Score Submission Received ]
              │
              ▼
[ Server Authoritative Environment Resolution ]
              │
    ┌─────────┴─────────┐
    ▼                   ▼
['test' Environment]   ['live' Environment]
  • Before start_date    • During live window (start_date to end_date)
  • In Studio preview    • Public player kiosk with valid session
  • Setup Day rehearsal  • Event payment_status === 'PAID'
  • is_test = true       • is_test = false
  • score_mode = 'TEST'  • score_mode = 'LIVE'
    │                   │
    ▼                   ▼
[ Quarantined Table ]  [ Public Live Leaderboard ]
(Hidden from public)   (Ranked & visible to attendees)
```

### Inviolable Rules
1. **Server-Authoritative Override**:
   - The server decides score environment based on event status and current UTC+8 date (`determineScoreEnvironment`).
   - If a malicious player client submits `is_test = true` during an active live event to avoid detection, the server overrides it to `is_test = false` (`mode: 'LIVE'`).
2. **Unpaid Event Guard**:
   - Scores submitted to an event with `payment_status !== 'PAID'` during the live window are rejected with `403 PAYMENT_REQUIRED`.
3. **Pre-Open Guard**:
   - Scores submitted by public attendees before Setup Day are rejected with `403 EVENT_NOT_OPEN`.

---

## 2. Test Score Lifecycle & Automatic Clearing

### Automatic Clearing on Live Transition
When an event transitions into its live tournament window (reaching its configured `start_date` at `00:00:00` UTC+8):
- The background cron or the first live score request triggers `ensureTestScoresClearedForLiveEvent`.
- `clearEventTestScores(eventId)` executes:
  - Deletes all rows in `event_high_scores` where `score_environment = 'test'` OR `is_test = true`.
  - Strictly **preserves** any genuine live scores.
  - Updates `events.test_scores_cleared_at = now()`.
- Idempotent: Can safely run multiple times without deleting live scores.

### Manual Clearing by Organizers
- Event organizers can manually wipe test scores via `POST /api/events/:eventId/admin/high-scores/clear`.
- Requires authenticated organization membership (`owner`, `admin`, or `member`).
- Can selectively clear `target = 'test'` (default) or `target = 'all'`.

---

## 3. Leaderboard Visibility & Sanitization

### Public Leaderboard (`GET /api/public/events/:publicToken/high-scores`)
- **Strict Data Isolation**: Displays ONLY official live scores (`score_environment = 'live'`). Test scores are filtered out at the SQL query level.
- **Top N Limits**: Returns top 10, 20, 50, or 100 entries based on query parameter `limit`.
- **Player Name Sanitization**:
  - `sanitizePlayerName`: Trims whitespace, truncates to 24 characters, strips control characters, and falls back to `"Player"` if empty.
- **Cache-Control**: Configured with short TTL (`max-age=5, s-maxage=5`) for fast tournament responsiveness while preventing database exhaustion.

### Admin High Scores (`GET /api/events/:eventId/admin/high-scores`)
- Accessible only to authenticated organization members.
- Supports filtering by `environment=test`, `environment=live`, or `environment=all`.
- Returns detailed telemetry: player email, player phone (if collected), device metadata, game duration, and session timestamps.
- Returns score summary statistics (`getEventScoreStats`): total plays, unique players, average score, highest score, lowest score.

---

## 4. Session Tracking & Anti-Cheat Validation

To prevent script kiddies from spamming scores via headless HTTP requests:

### Session ID Requirements
- Every score submission must include a valid `session_id` (or `sessionId` in body/metadata).
- Valid format: UUID v4 or alphanumeric token matching `/^[a-zA-Z0-9_-]{16,64}$/`.
- If an invalid or empty session ID is provided, the backend rejects with `422 INVALID_SESSION_ID`.

### Concurrency Lock / Deduplication
- The backend tracks in-flight submissions per event and session: `${eventId}:${sessionId}`.
- Prevents double-submission race conditions when users double-tap the "Submit Score" button.

### Game-Specific Validation Rules
Each game engine verifies reasonable physical bounds:
1. **Catch the Brand (`catch-brand`)**:
   - Checks maximum theoretically possible items caught per second based on configured fall speed and duration.
   - Rejects physically impossible score spikes.
2. **Brand Memory Match (`memory-match`)**:
   - Validates minimum possible moves required to solve the grid ($N \text{ pairs} \ge N \text{ moves}$).
   - Validates mismatch delays and calculates max possible combo multipliers.
3. **Formula Reaction Lights (`reaction-tap` / `reaction-time`)**:
   - Reaction times under 100ms are flagged as false-starts / anticipation jumps.
   - Average reaction time must fall within physiological human limits ($120\text{ms} - 5000\text{ms}$).

---

## 5. Relevant Database Tables & Fields

| Table | Column | Purpose |
| :--- | :--- | :--- |
| `public.event_high_scores` | `score_environment` | Enum/Text: `'test'` vs `'live'` |
| `public.event_high_scores` | `is_test` | Boolean flag indicating rehearsal status |
| `public.event_high_scores` | `score` | Numeric score value |
| `public.event_high_scores` | `session_id` | Unique gameplay session tracking ID |
| `public.event_high_scores` | `player_name` | Sanitized display name |
| `public.event_high_scores` | `player_email` | Optional attendee email for kiosk leads |
| `public.event_high_scores` | `metadata` | JSON metadata (game duration, combo count, inputs) |
| `public.events` | `test_scores_cleared_at` | Timestamp recording when rehearsal scores were wiped |
