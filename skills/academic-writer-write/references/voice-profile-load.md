# Voice Profile Load Contract

1. Read `AUTHOR_VOICE.md` from project root at the start of every write/edit run.
2. Pass the whole file into every `section-writer` prompt.
3. Tell the section writer to weight `## Academic-specific` rules higher when they conflict with `## Core voice`; everything else applies as written.
4. If `AUTHOR_VOICE.md` is missing or empty, warn once: "No voice profile. Run `/skill:academic-writer-init` to seed it." Do not block writing.
