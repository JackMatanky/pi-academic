# Removed RAG Information

This file archives RAG-related instructions and promises removed from active Academic Writer prompts during the local-source/Sefaria implementation. It is not an active workflow contract; `docs/rag-todo.md` tracks future implementation work.

## Removed active promises

- Research could use “Zotero and RAG” as indexed sources.
- Research would spawn a dedicated RAG subagent.
- Deep read would run “3 RAG queries simultaneously, then entity queries in parallel.”
- Research would query “RAG + Zotero” in separate subagents.
- Exact quote/page verification could use “RAG bypass + Zotero.”
- NotebookLM claims would be verified against “Zotero/RAG” results.
- If RAG found a passage Zotero did not, the result could be included with page numbers from RAG.

## Removed research-mode RAG subagent contract

Original removed behavior:

```markdown
1. **RAG subagent**: Pass as prompt the question, questionType, sourceIds. This subagent runs multi-mode RAG queries (mix + local + bypass as needed).

### RAG Subagent Instructions

The RAG subagent should:

1. **Classify the question type** and select RAG modes:

| Question type     | Queries to run                                            |
| ----------------- | --------------------------------------------------------- |
| Direct question   | `mix` (broad) + `local` (key entities)                    |
| Topic exploration | `global` (themes) + `mix` (detail) + `local` (per entity) |
| Comparison        | `local` (Author A) + `local` (Author B) + `mix` (topic)   |
| Quote search      | `bypass` (exact) + `mix` (context)                        |
| Source lookup     | `mix` (topic)                                             |

2. **Run all queries** with `include_context: true`, `top_k: 30`, `rerank_top_k: 10`, `enable_rerank: true`
3. **Return organized passages** with source attribution from the `context` field
4. **Never cite the `answer` field** — only `context`
```

## Removed merge rules

Original removed behavior:

```markdown
1. If both RAG and Zotero found the same passage, use Zotero's version (more precise page numbers)
2. If RAG found something Zotero didn't, include it with a note that page numbers come from RAG
3. If Zotero found full text that RAG summarized, prefer the full text
```

## Removed output templates

Original removed examples:

```markdown
> - [Author], _[Work]_, p. [page] — "[relevant quote]" _(via Zotero/RAG)_
> - [Author], _[Work]_, p. [page] — "[relevant quote]" _(via RAG)_
>   **Verified:** ✓ Zotero page confirmed / ⚠ RAG only (page may need verification)
```

## Removed edit/write/audit references

- Edit-section expansion previously launched “one subagent for RAG queries on the expansion topic.”
- Edit citation verification previously warned it could “only verify against RAG/Zotero reads” when `sources.json` was stale.
- Auditor rewrite guidance previously allowed wrong-page fixes from “RAG results if a RAG tool was used.”
- Write workflow previously said NotebookLM “does not replace Vectorless/Zotero for citation verification.”
- Write workflow previously said citations must still be verified “via Zotero or RAG.”

## Replacement now active

- Zotero remains preferred when enabled.
- `.academic-writer/sources/` supports local PDF/DOCX/MD/TXT source ingestion.
- `academic_writer_ingest_sources` generates source records, citekeys, and BibTeX without Zotero.
- `docs/rag-todo.md` tracks future RAG integration before any active prompt claims are restored.
