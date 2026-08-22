---
starter_id: expo
package_manager: npm
project_name: voice-assistant
hints:
  language_family: js
  team_size: solo
  deployment_target: appstore-via-eas
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: verified
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
---

## Why this stack

A solo developer shipping a 3-week, after-hours mobile MVP in JS/TypeScript needs the default JS mobile starter. Expo covers cross-platform iOS/Android from a single codebase, clears all four agent-friendly quality gates (typed, convention-based, popular in training data, well documented), and is bootstrapper-verified, so scaffolding will be smooth. Auth (one-time Google OAuth for calendar access) and AI (speech-to-text, NLU parsing, text-to-speech for the voice interaction loop) feature flags are set from the PRD's functional requirements; payments, realtime, and background jobs are out of scope. Deployment defaults to App Store distribution via EAS, the starter's standard path. CI runs on GitHub Actions with auto-deploy-on-merge.
