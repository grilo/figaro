# Fresh writing-quality sample — 20 September 2026

Eight documents were frozen before the spelling, advice-context and grammar
changes in this evaluation. Engine output was inspected only after those
changes were settled. The manifest pins their exact UTF-8 bytes, sources,
licenses, normalization and six pre-annotated errors in two original drafts.
The other two original documents are intended acceptable prose. These labels
and the later finding judgments are agent-authored, not independent human gold.

- `p-limit` and `p-retry`: full original Markdown manuals by Sindre Sorhus,
  pinned to the revisions in the manifest, under their accompanying MIT licenses.
  They share an author/package family with the earlier `p-map` sample, so the
  documents are fresh but that source family is not held out.
- `ocean`: NOAA National Ocean Service, [Why is the ocean blue?](https://oceanservice.noaa.gov/facts/oceanblue.html),
  updated 16 June 2024. NOAA-authored text is public domain under the
  [National Ocean Service reuse guidance](https://oceanservice.noaa.gov/about/faq.html).
  The title, subtitle and complete body are transcribed from web text extraction;
  navigation, photo/caption and footer are omitted. This test fixture does not
  imply NOAA endorsement.
- `passport`: [Apply online for a UK passport](https://www.gov.uk/apply-renew-passport),
  Crown copyright, licensed under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
  The complete main guidance, including headings, lists and service link, is
  transcribed to Markdown; site navigation, feedback and footer are omitted.
  It is a dated language-test fixture, not current travel guidance.
- `library`, `handover`, `orchard`, `museum`: original agent-authored prose
  under the repository's GPL-3.0-or-later license. Seeded-error spans were
  recorded before running an engine. Published text was not altered to insert
  errors, and an empty error list does not certify it as error-free.

Run `node scripts/evaluate-writing-documents.mjs --manifest
tests/fixtures/writing-quality-documents/manifest.json --output /tmp/figaro-writing-quality.json`.
The runner checks source and included-license hashes, then uses the actual
JavaScript, dictionary, native Go and resolver adapters. All checks are selected
to inspect their combined output. Once these documents inform a later fix,
they become regression material. See the
[quality report](../../../docs/benchmarks/writing-quality-2026-09-20.md) for
every finding, offered edit, retained error and evaluation limit.
