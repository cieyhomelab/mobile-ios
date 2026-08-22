---
bootstrapped_at: 2026-08-22T09:31:12Z
starter_id: expo
starter_name: "Expo (React Native)"
project_name: voice-assistant
language_family: js
package_manager: npm
cwd_strategy: subdir-then-move
bootstrapper_confidence: verified
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
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
```

### Why this stack

A solo developer shipping a 3-week, after-hours mobile MVP in JS/TypeScript needs the default JS mobile starter. Expo covers cross-platform iOS/Android from a single codebase, clears all four agent-friendly quality gates (typed, convention-based, popular in training data, well documented), and is bootstrapper-verified, so scaffolding will be smooth. Auth (one-time Google OAuth for calendar access) and AI (speech-to-text, NLU parsing, text-to-speech for the voice interaction loop) feature flags are set from the PRD's functional requirements; payments, realtime, and background jobs are out of scope. Deployment defaults to App Store distribution via EAS, the starter's standard path. CI runs on GitHub Actions with auto-deploy-on-merge.

## Pre-scaffold verification

| Signal      | Value                                      | Severity | Notes                                              |
| ----------- | ------------------------------------------- | -------- | --------------------------------------------------- |
| npm package | create-expo-app v4.0.0 published 2026-08-01 | fresh    | resolved from cmd_template                          |
| GitHub repo | not run                                     | n/a      | card.docs_url (https://docs.expo.dev) is not a GitHub repo URL |

## Scaffold log

**Resolved invocation**: `npx create-expo-app .bootstrap-scaffold --yes --template default`
**Strategy**: subdir-then-move
**Exit code**: 0
**Files moved**: 16
**Conflicts (.scaffold siblings)**: none
**.gitignore handling**: moved silently (no pre-existing cwd `.gitignore`)
**.bootstrap-scaffold cleanup**: deleted

## Post-scaffold audit

**Tool**: npm audit --json
**Summary**: 0 CRITICAL, 0 HIGH, 11 MODERATE, 0 LOW
**Direct vs transitive**: not distinguished by this npm version's output (`metadata.dependencies.direct` field absent)

#### CRITICAL findings

None.

#### HIGH findings

None.

#### MODERATE findings

- **@expo/cli** — range `<=0.0.0-canary-20231123-1b19f96-4 || >=0.0.1-canary-20231125-d600e44`. Fix: upgrade to `expo@46.0.21` (semver-major). Via: @expo/config, @expo/config-plugins, @expo/inline-modules, @expo/metro-config, @expo/prebuild-config.
- **@expo/config** — range `<=0.0.1-canary-20240418-8d74597 || >=3.3.23-alpha.0`. Fix: upgrade to `expo@46.0.21` (semver-major). Via: @expo/config-plugins.
- **@expo/config-plugins** — range `*`. Fix: upgrade to `expo-splash-screen@55.0.24` (semver-major). Via: xcode.
- **@expo/inline-modules** — range `>=0.0.2-canary-20260409-6fc2991`. Fix: upgrade to `expo@46.0.21` (semver-major). Via: @expo/config-plugins.
- **@expo/local-build-cache-provider** — range `*`. Fix: upgrade to `expo@46.0.21` (semver-major). Via: @expo/config.
- **@expo/metro-config** — range `<=0.0.1-canary-20240418-8d74597 || >=0.1.49-alpha.0`. Fix: upgrade to `expo@46.0.21` (semver-major). Via: @expo/config.
- **@expo/prebuild-config** — range `*`. Fix available (non-breaking). Via: @expo/config, @expo/config-plugins.
- **expo** — range `40.0.0-alpha.0 - 40.0.0-beta.5 || >=41.0.0-alpha.0`. Fix: upgrade to `expo@46.0.21` (semver-major). Via: @expo/cli, @expo/config, @expo/config-plugins, @expo/local-build-cache-provider, @expo/metro-config.
- **expo-splash-screen** — range `55.0.10-canary-20260424-7bedc9d - 55.0.10-canary-20260429-a5e59cf || >=56.0.0-canary-20260212-4f61309`. Fix: upgrade to `expo-splash-screen@55.0.24` (semver-major). Via: @expo/config-plugins.
- **uuid** — range `<11.1.1`. Missing buffer bounds check in v3/v5/v6 when `buf` is provided. Fix: upgrade to `expo-splash-screen@55.0.24` (semver-major, pulls in a fixed uuid transitively).
- **xcode** — range `>=0.9.2`. Fix: upgrade to `expo-splash-screen@55.0.24` (semver-major). Via: uuid.

#### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint                     | Value           |
| ------------------------- | ---------------- |
| bootstrapper_confidence   | verified         |
| quality_override          | false            |
| path_taken                 | standard         |
| self_check_answers        | null             |
| team_size                  | solo             |
| deployment_target          | appstore-via-eas |
| ci_provider                 | github-actions   |
| ci_default_flow            | auto-deploy-on-merge |
| has_auth                   | true             |
| has_payments                | false            |
| has_realtime                | false            |
| has_ai                      | true             |
| has_background_jobs         | false            |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history. Note: `create-expo-app` already initialized a `.git/` in this scaffold.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep (none were created this run).
- Address audit findings per your project's risk tolerance — all 11 are MODERATE severity and resolve via a semver-major `expo` / `expo-splash-screen` upgrade; the full breakdown is above.
