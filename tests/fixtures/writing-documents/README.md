# Whole-document writing fixtures

Frozen for the 20 September 2026 exploratory evaluation before engine results
were reviewed. `manifest.json` owns source identities, licenses, hashes,
languages, seeded errors and valid-language controls. Keep these documents
unchanged; add a new snapshot for subsequent editorial changes.

`third-party/` contains complete, unmodified Markdown manuals pinned to the
revisions in the manifest. Each retains its corresponding MIT license and
copyright notice. No linked images or other remote assets were downloaded.
Those licenses apply to the copied manuals independently of Figaro's license.
The other four documents and their annotations were authored by Codex for this
evaluation and use the repository's GPL-3.0-or-later license.

Fixtures deliberately contain mistakes. They are data, not product instructions
or claims about the current writing engine. Original notes include Markdown
protection cases and correct US/UK prose. An absence of seeded errors in a
published manual does not label that document error-free.

Run `node scripts/evaluate-writing-documents.mjs --output /tmp/writing-review.json`
from the repository. The [report](../../../docs/benchmarks/writing-documents-2026-09-20.md)
and its JSON ledger retain separate agent judgments. This is not independently
human-annotated gold data or the larger pilot proposed in
[WRITING_CORPUS.md](../../../docs/WRITING_CORPUS.md).
