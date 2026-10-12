# Vendored anti-slop Oxlint plugin

- Source: `dmmulroy/anti-slop` (GitHub), via the `install-anti-slop` skill bundle recorded in `skills-lock.json` (computedHash `4031728f…9c0c8`).
- Source commit: unknown. The skill bundle carries no revision; only the content hash above identifies it.
- Installed from: `.agents/skills/install-anti-slop/assets/anti-slop/` with `scripts/install.mjs`, unmodified.
- Entry points: `index.ts` (generic). `effect/index.ts` is present but not registered (no direct `effect` dependency).
- Local deviations: none.
- Dependencies: `oxlint` and `@oxlint/plugins` pinned together at 1.87.0 (root `package.json`).
- Config: `.oxlintrc.json`; run through `mise run lint` (`mise run fmt` applies autofixes).
