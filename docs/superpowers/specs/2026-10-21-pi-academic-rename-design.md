# Pi Academic Rename: Design

Date: 2026-10-21
Status: Approved

## Goal

Rename the package identity from `academic-writer` to `pi-academic`, fully and without migration shims. Existing projects with a `.academic-writer/` data directory are not carried forward; the researcher starts fresh under `.pi-academic/`.

## Identity mapping

| Item           | Old                                     | New                                       |
| -------------- | --------------------------------------- | ----------------------------------------- |
| npm name       | `academic-writer`                         | `pi-academic` (verified free on npm)        |
| GitHub repo    | `JackMatanky/academic-writer`             | `JackMatanky/pi-academic`                   |
| Display name   | Academic Writer                         | Pi Academic                               |
| Data directory | `.academic-writer/`                       | `.pi-academic/`                             |
| Tool prefix    | `academic_writer_*` (43 tools, 71 files)  | `pi_academic_*`                             |
| Extension dir  | `extensions/pi-academic-writer/`          | `extensions/pi-academic/`                   |
| Assets         | `pi-academic-writer.png` / `.svg`         | `pi-academic.png` / `.svg`                  |
| Root env var   | `ACADEMIC_WRITER_ROOT`                    | `PI_ACADEMIC_ROOT`                          |

## Unchanged

- **Skill names**: all 12 skills keep `academic-*` directory names, frontmatter `name`s, and `/skill:academic-*` commands.
- **Agent names**: the planner agent stays `academic`; `writer`, `editor`, `researcher` are untouched.
- **Upstream attribution**: `yodem/academic-writer` in README Acknowledgements must survive every replacement pass.
- **Historical specs**: files under `docs/superpowers/specs/` are point-in-time records and are excluded from the rename and the straggler gate.
- **Pitch documents**: the root-level `pitch-*.md` files describe the original upstream Claude Code plugin; they are excluded from every replacement pass and from the straggler gate.

## Fresh start (no shims)

- No code reads a former `.academic-writer/` directory.
- README Troubleshooting gains one line: the package was formerly named `academic-writer`; old `.academic-writer/` data directories are not read.
- README/AGENTS install and issue-tracker URLs use `JackMatanky/pi-academic`. Renaming the GitHub repository makes old clone URLs redirect; no compatibility copy of the repo is kept.

## Execution shape

Applied in this order so no pattern consumes another:

1. `.academic-writer` → `.pi-academic` (data-directory references).
2. `pi-academic-writer` → `pi-academic` (extension dir, image asset paths).
3. `ACADEMIC_WRITER` → `PI_ACADEMIC`, including the split-literal construction in `extensions/tests/repo-hygiene.test.ts` (`"ACADEMIC_WRITER" + "_ROOT"`).
4. `academic_writer` → `pi_academic` (tool names and snake-case identifiers).
5. `JackMatanky/academic-writer` → `JackMatanky/pi-academic` (6 references).
6. `package.json` `"name"` → `pi-academic`.
7. Display name `Academic Writer` → `Pi Academic` (README, AGENTS.md, prose; 151 hits in 51 files).

`git mv` moves: `extensions/pi-academic-writer/`, `assets/pi-academic-writer.{png,svg}`. Skill directories and `agents/academic.md` do not move.

Guard: every replacement is owner- or pattern-scoped; there is no untargeted pass over the bare lowercase string `academic-writer`. The only surviving occurrences are `yodem/academic-writer` (step 5 is scoped to the `JackMatanky/` owner prefix) and the intentional former-name note in README Troubleshooting.

Docs (`README.md`, `AGENTS.md`, skills prose where it names tools or paths) are updated in the same change; `extensions/tests/docs-contracts.test.ts` enforces tool-name consistency between docs and registration, and `package-structure.test.ts` enforces the directory layout.

## Verification

1. `mise run ci` runs formatting, Vite+ lint, strict TypeScript, and the Vitest suite (docs-contracts, package-structure, repo-hygiene, tool tests).
2. Straggler gate: `rg --hidden -i 'academic[-_ ]writer' -g '!.git/**'` excluding `docs/superpowers/**` and `pitch-*.md` returns only (a) `yodem/academic-writer`, (b) the intentional former-name note in README Troubleshooting, and (c) the intentional `/academic-writer:` detector string in `extensions/tests/repo-hygiene.test.ts`.

## Repository side (manual)

- `gh repo rename pi-academic` on `JackMatanky/academic-writer`; GitHub redirects the old path.
- Future npm publishing uses name `pi-academic`.

## Risks

- **Over-broad replacement** eats the `yodem/` attribution: prevented by owner-scoped patterns and the post-pass gate.
- **Docs/tool drift**: prevented by running `docs-contracts.test.ts` in CI on the same change.
- **npm name taken before publish**: verified free at design time; re-verify at release time.
