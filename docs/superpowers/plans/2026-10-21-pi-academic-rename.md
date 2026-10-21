# Pi Academic Rename Implementation Plan

> **Executed 2026-10-21** (8 commits, all tasks complete). Note: Task 1's own replacement pass rewrote the old-name literals inside this document before the `docs/superpowers/**` exclusion was added; commit `4a38504` holds the original text.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the package from `academic-writer` to `pi-academic` end to end (npm name, repo URLs, data dir, tool prefix, display name), fresh start with no migration shims.

**Architecture:** One ordered codemod per task so no pattern consumes another (`pi-academic` first, then bare identity refs, then data dir, then tool prefix, then env literal, then display name). The existing Vitest suite (docs-contracts, package-structure, repo-hygiene, lifecycle) is the safety net; `mise run ci` must pass before every commit.

**Tech Stack:** ripgrep + perl in-place passes on macOS, mise task runner, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-21-pi-academic-rename-design.md`

**Common exclusions** for every `rg -l` pass (repeat flags verbatim):

```
-g '!node_modules' -g '!docs/superpowers/specs/**' -g '!pitch-*.md'
```

Pitch files (`pitch-*.md`) describe the original upstream Claude Code plugin and stay untouched, like the `yodem/` attribution. Skill names (`academic-*`), agents, and `/skill:` commands never change.

---

### Task 1: Rename extension directory and assets

**Files:**
- Move: `extensions/pi-academic/` → `extensions/pi-academic/`
- Move: `assets/pi-academic.png` → `assets/pi-academic.png`
- Move: `assets/pi-academic.svg` → `assets/pi-academic.svg`
- Modify: all 29 files referencing `pi-academic` (package.json manifest paths, tests, AGENTS.md)

- [ ] **Step 1: git mv the three paths**

```bash
git mv extensions/pi-academic extensions/pi-academic
git mv assets/pi-academic.png assets/pi-academic.png
git mv assets/pi-academic.svg assets/pi-academic.svg
```

- [ ] **Step 2: rewrite references**

```bash
rg -l 'pi-academic' -g '!node_modules' -g '!docs/superpowers/specs/**' -g '!pitch-*.md' | xargs perl -pi -e 's/pi-academic/pi-academic/g'
```

- [ ] **Step 3: verify no leftovers**

```bash
rg -l 'pi-academic' -g '!node_modules' -g '!docs/superpowers/specs/**' -g '!pitch-*.md'; echo "exit=$?"
```

Expected: no output, `exit=1` (no matches).

- [ ] **Step 4: run full CI**

```bash
mise run ci
```

Expected: lint, typecheck, and all tests PASS (package-structure and repo-hygiene assert the extension path).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: rename extension dir and assets to pi-academic"
```

---

### Task 2: Package identity, repo URLs, bare references

**Files:**
- Modify: `package.json` (`name`), `package-lock.json` (2 `name` fields), `README.md` (6 `JackMatanky/` URLs), `mise.toml:1`, `.rumdl.toml:1`, `AGENTS.md:110`

- [ ] **Step 1: npm name in manifest and lockfile**

```bash
perl -pi -e 's/"name": "academic-writer"/"name": "pi-academic"/g' package.json package-lock.json
```

- [ ] **Step 2: self-referential repo URLs**

```bash
perl -pi -e 's|JackMatanky/academic-writer|JackMatanky/pi-academic|g' README.md package.json
```

- [ ] **Step 3: comments and the Claude Code anti-pattern example**

```bash
perl -pi -e 's/academic-writer/pi-academic/g' mise.toml .rumdl.toml
perl -pi -e 's|/academic-writer:|/pi-academic:|g' AGENTS.md
```

- [ ] **Step 4: verify bare form is gone everywhere legitimate**

```bash
rg -nP '(?<!\.)\b(?!pi-)(?!yodem/)(?!JackMatanky/)academic-writer' -g '!node_modules' -g '!docs/superpowers/specs/**' -g '!pitch-*.md'; echo "exit=$?"
```

Expected: no output, `exit=1`.

- [ ] **Step 5: run full CI**

```bash
mise run ci
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: rename npm package and repo identity to pi-academic"
```

---

### Task 3: Project data directory `.academic-writer/` → `.pi-academic/`

**Files:**
- Modify: ~75 files (skills, agents, README, AGENTS.md, extension source, tests, `.gitignore:22`)

- [ ] **Step 1: rewrite data-dir references (`.gitignore` appended because rg skips hidden files)**

```bash
(rg -l '\.academic-writer' -g '!node_modules' -g '!docs/superpowers/specs/**' -g '!pitch-*.md'; echo .gitignore) | xargs perl -pi -e 's/\.academic-writer/.pi-academic/g'
```

- [ ] **Step 2: verify**

```bash
rg --hidden -l '\.academic-writer' -g '!.git/**' -g '!docs/superpowers/specs/**' -g '!pitch-*.md'; echo "exit=$?"
```

Expected: no output, `exit=1`.

- [ ] **Step 3: run full CI**

```bash
mise run ci
```

Expected: PASS (tests create `.pi-academic/` fixtures after the rewrite).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: move project data directory to .pi-academic"
```

---

### Task 4: Tool prefix `academic_writer_*` → `pi_academic_*`

**Files:**
- Modify: 71 files (extension tool registrations, skills, agents frontmatter, README, AGENTS.md, tests)

- [ ] **Step 1: rewrite the prefix**

```bash
rg -l 'academic_writer' -g '!node_modules' -g '!docs/superpowers/specs/**' -g '!pitch-*.md' | xargs perl -pi -e 's/academic_writer/pi_academic/g'
```

- [ ] **Step 2: verify**

```bash
rg -l 'academic_writer' -g '!node_modules' -g '!docs/superpowers/specs/**' -g '!pitch-*.md'; echo "exit=$?"
```

Expected: no output, `exit=1`.

- [ ] **Step 3: run full CI**

```bash
mise run ci
```

Expected: PASS (docs-contracts requires registered names and doc mentions to match; both were rewritten in the same pass).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: rename tool prefix to pi_academic"
```

---

### Task 5: Root env forbidden-string literal

**Files:**
- Modify: `extensions/tests/repo-hygiene.test.ts:15`

- [ ] **Step 1: rewrite the split literal** (assembled from fragments so the scan never matches itself; keep it split)

```bash
perl -pi -e 's/"ACADEMIC_WRITER"/"PI_ACADEMIC"/' extensions/tests/repo-hygiene.test.ts
```

- [ ] **Step 2: verify**

```bash
rg -n 'PI_ACADEMIC' extensions/tests/repo-hygiene.test.ts
```

Expected: line 15 reads `const ROOT_ENV = "PI_ACADEMIC" + "_ROOT";` and no file contains the contiguous string `PI_ACADEMIC_ROOT` (the test scans for it).

```bash
rg -l 'PI_ACADEMIC_ROOT' -g '!node_modules'; echo "exit=$?"
```

Expected: no output, `exit=1`.

- [ ] **Step 3: run full CI**

```bash
mise run ci
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: rename root env contract literal to PI_ACADEMIC"
```

---

### Task 6: Display name "Academic Writer" → "Pi Academic"

**Files:**
- Modify: 51 files (`Academic Writer`) plus `extensions/lifecycle/index.ts:202` and `extensions/tests/lifecycle.test.ts:117` (`ACADEMIC WRITER` banner)

- [ ] **Step 1: prose form**

```bash
rg -l 'Academic Writer' -g '!node_modules' -g '!docs/superpowers/specs/**' -g '!pitch-*.md' | xargs perl -pi -e 's/Academic Writer/Pi Academic/g'
```

- [ ] **Step 2: dashboard banner form**

```bash
rg -l 'ACADEMIC WRITER' -g '!node_modules' -g '!docs/superpowers/specs/**' -g '!pitch-*.md' | xargs perl -pi -e 's/ACADEMIC WRITER/PI ACADEMIC/g'
```

- [ ] **Step 3: verify**

```bash
rg -il 'academic writer' -g '!node_modules' -g '!docs/superpowers/specs/**' -g '!pitch-*.md'; echo "exit=$?"
```

Expected: no output, `exit=1`.

- [ ] **Step 4: run full CI**

```bash
mise run ci
```

Expected: PASS (lifecycle test asserts the new banner text).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: rename display name to Pi Academic"
```

---

### Task 7: README former-name note and straggler gate

**Files:**
- Modify: `README.md` Troubleshooting (insert after the "No profile found" bullet)

- [ ] **Step 1: add the fresh-start note** (avoid the forbidden word; see STALE in extensions/tests/repo-hygiene.test.ts)

Insert exactly this line after the `**"No profile found"**` line:

```markdown
**"Old .academic-writer/ data"**: the package was formerly named `academic-writer`; `.academic-writer/` directories are not read. Run `/skill:academic-setup` to create `.pi-academic/`.
```

- [ ] **Step 2: straggler gate**

```bash
rg --hidden -i 'academic[-_ ]writer' -g '!.git/**' -g '!docs/superpowers/specs/**' -g '!pitch-*.md'
```

Expected: exactly two lines, both in `README.md`: the `yodem/academic-writer` attribution (Acknowledgements) and the new former-name note. Anything else is a miss; track it down and fix before committing.

- [ ] **Step 3: run full CI**

```bash
mise run ci
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: add former-name note to README troubleshooting"
```

---

### Task 8: Rename the GitHub repository (manual, user-confirmed)

**Files:** none locally; GitHub side only.

- [ ] **Step 1: confirm with the researcher, then run**

```bash
gh repo rename pi-academic --repo JackMatanky/academic-writer
```

Expected: GitHub renames the repo and redirects all old URLs (`pi install git:github.com/JackMatanky/academic-writer` keeps working via redirect; README already points at the new path).

- [ ] **Step 2: sanity-check the install URL resolves**

```bash
gh repo view JackMatanky/pi-academic --json name,url
```

Expected: `name` is `pi-academic`.
