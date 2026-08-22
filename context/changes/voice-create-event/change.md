---
change_id: voice-create-event
title: Voice create event
status: impl_reviewed
created: 2026-08-22
updated: 2026-08-22
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- **Wake word is a stand-in, not the plan's custom keyword.** Phase 1's "Custom wake word asset" (author a keyword in the Picovoice Console, bundle the `.ppn`) was never completed — no Picovoice Console access during implementation. `src/lib/wake-word.ts` uses Porcupine's built-in "Jarvis" keyword instead (`PorcupineManager.fromBuiltInKeywords`). Swap to `PorcupineManager.fromKeywordPaths(...)` once a real custom `.ppn` is authored and bundled.
