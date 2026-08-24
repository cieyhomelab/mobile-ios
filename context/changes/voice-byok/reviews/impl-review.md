<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: BYOK (User-Entered API Keys)

- **Plan**: context/changes/voice-byok/plan.md
- **Scope**: Full plan — Phases 1-6
- **Date**: 2026-08-24
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — useByokStatus can hang in 'checking' forever

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/hooks/use-byok-status.ts:14-19
- **Detail**: `hasRequiredKeys()` is awaited inside a bare `void (async () => {...})()` with no try/catch. If SecureStore.getItemAsync ever rejects, the rejection is unhandled and `state` never leaves `'checking'`, so the redirect-to-Settings nudge in index.tsx never fires. Blast radius is limited since pipeline call sites independently re-check keys and still show the missing-key banner.
- **Fix**: Wrap the effect body in try/catch, defaulting to `'missing'` on error, matching `useGoogleCalendarSession`'s pattern of always reaching a terminal state.
- **Decision**: FIXED

### F2 — Settings screen can show a false "Not connected" on a read error

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/settings.tsx:40-51
- **Detail**: The mount-time `Promise.all([hasElevenLabsKey(), hasAnthropicKey(), getElevenLabsVoiceId()])` has no try/catch. If any SecureStore read throws, the screen keeps its initial `{connected:false}` state and can show "Not connected" even when a key is actually stored.
- **Fix**: Wrap the mount effect in try/catch; on failure, surface a distinct error/retry state instead of silently keeping the default "not connected" status.
- **Decision**: FIXED

### F3 — "Remove key" has no confirmation step

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality / Pattern Consistency
- **Location**: src/app/settings.tsx:73-79, 115-121 (handleRemoveElevenLabsKey, handleRemoveAnthropicKey)
- **Detail**: Both remove handlers call `clear*Key()` immediately on tap. Every other destructive action in this app confirms first — `handleLogoutPress` in src/app/index.tsx wraps logout in `Alert.alert(...)`. An accidental tap silently deletes a saved key and (per Phase 4) immediately locks the corresponding voice feature.
- **Fix**: Add an `Alert.alert('Remove key?', ...)` confirm step before each `clear*Key()` call, mirroring `handleLogoutPress`'s pattern.
- **Decision**: FIXED

### F4 — useByokStatus has no refresh; gate state can go stale across tabs

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/hooks/use-byok-status.ts (whole file)
- **Detail**: Status is computed once at mount, unlike `useGoogleCalendarSession` which exposes re-verification methods. If Home and Settings are sibling tabs kept mounted, adding/removing a key in Settings never updates a previously-resolved `byok.state` in Home. Masked in practice because pipeline call sites re-fetch keys fresh and `MissingApiKeyBanner` is independent of this hook — only the one-shot redirect nudge can be stale.
- **Fix A ⭐ Recommended**: Leave as-is for now
  - Strength: The functional gating (banner on missing-key errors) is already correct and doesn't depend on this hook.
  - Tradeoff: A user who removes their last key won't be auto-redirected until next app launch — they'll see the missing-key banner on their next voice action instead.
  - Confidence: HIGH — verified the pipeline call sites are independent of this hook.
  - Blind spot: Haven't verified NativeTabs' actual mount/unmount behavior on tab switch in this Expo Router version.
- **Fix B**: Add a `refresh()` method and call it from Settings on save/remove
  - Strength: Makes the redirect gate consistent with the rest of the BYOK UX.
  - Tradeoff: Extra coupling between settings.tsx and the hook for a nudge-only feature.
  - Confidence: MEDIUM — straightforward to add but touches two files.
  - Blind spot: None significant.
- **Decision**: ACCEPTED (Fix A — leave as-is; functional gating already correct via the missing-key banner)

### F5 — validate* functions return a union instead of throwing

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/secure-keys.ts:64-106
- **Detail**: `validateElevenLabsKey`/`validateAnthropicKey` return a `{valid, error}` discriminated union, while every other network-calling module in `src/lib/` throws a typed error class (`SttApiError`, `TtsApiError`, `ParseError`, `CalendarApiError`). This was the plan's explicit contract (needed for per-field inline UI messages) — not a defect, just the one non-throwing API wrapper in the codebase.
- **Fix**: None required — informational only.
- **Decision**: DISMISSED (deliberate design choice per plan's contract, not a defect)
