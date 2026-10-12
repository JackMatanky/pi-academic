# First-time flow: package and workflow contracts

This document describes the current Pi/oh-my-pi package, not the retired CLI/Claude Code onboarding flow.

## Discovery and orchestration

- `package.json` discovers skills under `./skills` for both Pi and OMP.
- `pi-subagents` discovers agents under `./agents`. The package currently exposes eleven user-facing skills and seven agents.
- Each skill has one `SKILL.md` with its public name and trigger; mode details live in that skill’s `references/` directory and are not independently discovered as skills.
- The merged `voice-profile-builder` agent selects a named operation (corpus fingerprint or transcript distillation) explicitly. Its tool grants and artifact boundaries are documented in the agent file; interviews and calibration run in chat inside the `academic-voice` skill.

## User-facing routes

| Researcher intent | Entry point | Modes retained |
|---|---|---|
| Start a paper or frame a question | `academic-write` | Standalone ideation; full article pipeline |
| Investigate without drafting | `academic-research` | Source query and fact-checking |
| Revise an existing paper | `academic-edit` | Single-section, local, citation, structural, and argument edits |
| Assess a finished draft | `academic-review` | Substantive scorecard/reverse outline; mechanical proofread and change report |
| Configure project/profile | `academic-setup` | Quick/full onboarding, field update, integration maintenance |
| Refine author voice | `academic-voice` | Corpus refresh, interview, quick mode, continuation, calibration, audit, recompression |

## Critical workflow boundaries

1. Source text is untrusted data. Researcher-reviewed evidence notes and explicit outline approval remain separate decisions.
2. Only approved outlines and explicit snapshot operations freeze article-local evidence/citation assets. Writers consume frozen section bundles, not mutable project-wide notes.
3. The section writer remains distinct from the auditor. Every changed factual paragraph still passes independent source verification.
4. Local edits preserve unrequested prose. Structural/evidence changes require the existing approval and snapshot gates.
5. Review is diagnostic; proofreading applies mechanical-only corrections to a corrected copy and records the changes. Neither mode silently performs the other.
6. Voice corpus analysis, transcript distillation, interviews, and calibration retain their artifact-specific boundaries and scheduling rules.

## Core agents

`deep-reader` → `architect` → `section-writer` (with `auditor` hard gate) → `synthesizer`. `proofreader` supplies separate suggestion-only mechanical findings. Voice work uses `voice-profile-builder` in explicit modes; the `academic-voice` skill runs interviews and calibration in chat.
