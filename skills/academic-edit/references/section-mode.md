<!-- Consolidated mode guidance for section-mode.md. -->

# Academic Writer — Edit Section

Ask only for the article/section and requested change if these are not already clear. If it's unclear whether the request is a local prose/citation/style change or an argument/evidence/structure change, ask one concise scope question before editing. State the proposed scope and preserved material before a structural rewrite; route all work through the full edit skill.

On failure, report the failed operation, authoritative existing artifact, whether article content changed, and one recovery action. A failed snapshot blocks drafting; a migration conflict preserves existing files for researcher review.

This is a single-section entrypoint for `/skill:academic-edit`. Run that skill in single-section mode with the article path and requested section; it owns structured outline migration, canonical outline edits, researcher approval, frozen citation/note snapshots, section_bundle dispatch, paragraph audit, preservation of untouched Markdown, and export. The writer persists its revised section with `pi_academic_write_section` (overwriting `articles/<slug>/sections/<sectionId>.md`); the skill then splices that file's content into `MD_PATH` in place of the existing section body, from the section heading to the next same-or-higher heading. Do not use a separate flat-section writer handoff here.
