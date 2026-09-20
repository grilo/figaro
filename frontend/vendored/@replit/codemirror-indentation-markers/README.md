# Figaro indentation marker adapter

The checked-in distribution retains the upstream indentation, blank-line and
active-scope rules. Figaro's `core/indentationMarkerModel.js` selects the active
scope from cached line entries, including disjoint visible ranges, instead of
walking absent entries through the whole document on each cursor move.

This package is not replaced by `scripts/vendor.sh`. Preserve the downstream
import and run `indentationMarkerModel.test.js`, `editorRemainingWork.test.js`,
the existing tab-size browser workflow, and native code-mode cursor checks when
updating it. The upstream source map does not describe the changed function.
