# First-time flow

Use this guide for the current Pi/oh-my-pi Academic Writer package. The package is installed through Pi or OMP; there is no separate `npx academic-setup` initializer. See [README.md](../README.md) for installation and companion-package prerequisites.

## Set up a project

Run `/skill:academic-setup` and choose the route that matches the task:

- **Quick setup** creates the profile and configures integrations without full source indexing.
- **Full setup** configures the profile and offers style analysis and local-source indexing.
- **Profile or integration maintenance** changes only the requested field or integration.

The setup skill checks project/profile state before acting. MCP server secrets belong in standard MCP configuration, not the researcher profile or tracked project files.

## Start work

- Use `/skill:academic-write` to frame a research question or write a new article.
- Use `/skill:academic-research` for a standalone question or source investigation.
- Use `/skill:academic-edit` for existing prose, including single-section edits.
- Use `/skill:academic-review` for substantive review or its mechanical proofread mode.

Local sources are supported without Zotero. A new-article workflow reviews source-backed evidence cards and the argument outline before freezing article-local evidence; later drafting uses those frozen bundles. The researcher may return to sources or revise the argument when needed.

For the full command list and citation/export behavior, see [README.md](../README.md).
