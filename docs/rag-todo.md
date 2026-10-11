# RAG Integration TODO

RAG/vector search is intentionally not active in this package yet.

## Future work

- Define a project-local RAG index location and lifecycle.
- Add profile config under `tools.rag` only after an implementation exists.
- Add deterministic health checks for the selected RAG backend.
- Update `academic-research`, `deep-reader`, and citation verification prompts to use RAG only when enabled and available.
- Keep Zotero and `.academic-writer/sources/` as the supported source paths until then.
