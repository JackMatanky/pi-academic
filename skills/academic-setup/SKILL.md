---
name: academic-setup
description: >-
  Set up or maintain the Pi Academic profile and integrations. Use when doing first-time onboarding,
  quick or full setup, source indexing, changing the research field, or adding/removing integrations.
allowed-tools: bash read write edit find grep subagent pi_academic_read_resource pi_academic_resolve_csl pi_academic_migrate_profile pi_academic_get_profile pi_academic_update_profile pi_academic_list_project_files pi_academic_extract_document pi_academic_ingest_sources pi_academic_resolve_mcp_tool pi_academic_write_voice_fingerprint pi_academic_update_author_voice
metadata: { author: "Yotam Fromm", version: "0.3.1" }
---

# Pi Academic setup and profile maintenance

This is one entrypoint with four explicit modes. Before changing anything, call `pi_academic_get_profile` when available and determine whether a profile already exists. If the request does not identify a mode, ask one concise question rather than silently choosing the extent of setup.

## Route by requested task

- **First-time or full setup / redo onboarding:** read `references/full-onboarding.md` and follow it. This route configures the researcher profile, citation style and style fingerprint, and offers source indexing as described there.
- **Quick setup:** read `references/quick-onboarding.md` and follow it. This is the shorter profile/integration route; it must not be presented as full source indexing or full fingerprint analysis.
- **Change research field:** read `references/profile-field.md` and follow it. Update only the field, preserving unrelated profile values.
- **Add, remove, or reconfigure integrations:** read `references/integration-maintenance.md` and follow it. Never put secrets in profile/project-tracked files; preserve existing MCP configuration unless the researcher explicitly approves a safe change.

Load `references/profile-schema.md` and `references/integration-setup.md` when the selected path requires their schema or integration details. These references are supporting contracts, not separate commands.

## Document appearance

Offer three choices during profile setup, following `references/document-style.md`: keep the shipped default behavior (no package selected), install the `academic-default` starter with `pi_academic_style_package` (`action: "install-starter"`: `design.json` plus editable native Word, LibreOffice, and LaTeX files under `native/`), or register an existing package under `.pi-academic/styles/<name>/`. A package requires a matching version-1 `design.json`; format-native reference documents/templates are optional and must remain inside the package. LaTeX/PDF template and preamble paths are relative `.tex` paths. Never overwrite an existing package. Validate every package with `pi_academic_style_package` (`action: "validate"`) before saving `outputFormatPreferences.stylePackage`; report the errors and warnings it returns rather than silently falling back.

## Safety and completion

- Keep profile creation/setup separate from maintenance of an existing profile; honor each selected route’s preconditions.
- A requested integration change is not permission to change unrelated profile fields or existing MCP configuration.
- Preserve cancellation, confirmation, and error recovery behavior in the selected reference. Report what was completed and any setup step still requiring researcher action; do not claim a tool is configured based only on a package being installed.
- Never duplicate, overwrite, or silently migrate existing profile or MCP artifacts outside the selected route’s explicit behavior.
