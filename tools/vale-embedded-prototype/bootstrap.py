#!/usr/bin/env python3
"""Materialize a disposable Vale fork; never modify Figaro's runtime or Go module."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
MODULE = 'github.com/vale-cli/vale/v3@v3.20.0'
SUM = 'h1:T8/M9+llPaqXCdKbQcn/zJWNOJX6YWFNIXfdoi1jVRg='


def replace_once(root, name, before, after):
    path = root / name
    source = path.read_text()
    if source.count(before) != 1:
        raise RuntimeError(f'Upstream patch anchor changed: {name}: {before[:80]}')
    path.write_text(source.replace(before, after, 1))


def main():
    workspace = Path(tempfile.mkdtemp(prefix='figaro-vale-embedded-'))
    module = json.loads(subprocess.check_output(['go', 'mod', 'download', '-json', MODULE], cwd=workspace))
    if module['Sum'] != SUM:
        raise RuntimeError('Unexpected upstream module checksum')
    fork = workspace / 'vale'
    shutil.copytree(module['Dir'], fork)
    fork.chmod(0o700)
    for path in fork.rglob('*'):
        path.chmod(0o700 if path.is_dir() else 0o600)
    for template in HERE.rglob('*.go.in'):
        target = fork / template.relative_to(HERE).with_suffix('')
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(template, target)
    shutil.copytree(ROOT / 'internal/writing/styles', fork / 'figaroembedded/styles')

    # Force text semantics even when the input happens to name an existing file.
    replace_once(fork, 'internal/core/config.go', 'type CLIFlags struct {', 'type CLIFlags struct {\n\tInMemory bool // Figaro prototype: source is never a file path.')
    # Upstream calls xdg.DataFile even with IgnoreGlobal, potentially creating a
    # host data directory. A library must skip that effect for embedded config.
    replace_once(fork, 'internal/core/config.go',
        'found, _ := DefaultStylesPath()\n\tif !flags.IgnoreGlobal && system.IsDir(found) {\n\t\tcfg.AddStylesPath(found)\n\t}',
        'if !flags.IgnoreGlobal {\n\t\tfound, _ := DefaultStylesPath()\n\t\tif system.IsDir(found) { cfg.AddStylesPath(found) }\n\t}')
    replace_once(fork, 'internal/core/file.go', 'if system.FileExists(src) {', 'if !config.Flags.InMemory && system.FileExists(src) {')
    # A bounded regex call is necessary because cancellation cannot interrupt it.
    replace_once(fork, 'internal/regex/regex.go', '"strings"', '"strings"\n\t"time"')
    replace_once(fork, 'internal/regex/regex.go', 'return &Regexp{Regexp: re, filter: Required(expr)}, nil', 're.MatchTimeout = 100 * time.Millisecond\n\treturn &Regexp{Regexp: re, filter: Required(expr)}, nil')
    # Only one caller owns each Linter. No process-wide mutable context or GC tuning.
    replace_once(fork, 'internal/lint/lint.go', '"errors"', '"errors"\n\t"context"')
    replace_once(fork, 'internal/lint/lint.go', 'type Linter struct {', 'type Linter struct {\n\tctx context.Context')
    replace_once(fork, 'internal/lint/lint.go', 'var err error\n\n\tfile, err := core.NewFile', 'var err error\n\tif err := l.cancelled(); err != nil { return lintResult{err: err} }\n\n\tfile, err := core.NewFile')
    replace_once(fork, 'internal/lint/lint.go', 'blks, err := f.NLP.Compute(&blk, split)', 'if err := l.cancelled(); err != nil { return err }\n\tblks, err := f.NLP.Compute(&blk, split)')
    replace_once(fork, 'internal/lint/lint.go', 'f.StartBlock()', 'if err := l.cancelled(); err != nil { return err }\n\tf.StartBlock()')
    for old, new in [
        ('r.rule.Run(blk, f, l.Manager.Config)', 'l.runRule(r.rule, blk, f)'),
        ('chk.Run(blk, f, l.Manager.Config)', 'l.runRule(chk, blk, f)'),
        ('rules[i].rule.Run(blk, f, l.Manager.Config)', 'l.runRule(rules[i].rule, blk, f)'),
    ]:
        replace_once(fork, 'internal/lint/lint.go', old, new)
    # Figaro already projects Markdown into prose. Exclude the two adapters that
    # pull C/tree-sitter parsers into a text-only build; reject accidental use.
    for name in ['internal/lint/code.go', 'internal/lint/fragment.go']:
        replace_once(fork, name, 'package lint', '//go:build !figaro_plaintext\n\npackage lint')
    # Every new template is an overlay, and all original notices remain in the fork.
    patches = {}
    for name in ['internal/core/config.go', 'internal/core/file.go', 'internal/regex/regex.go', 'internal/lint/lint.go', 'internal/lint/code.go', 'internal/lint/fragment.go']:
        patches[name] = hashlib.sha256((fork / name).read_bytes()).hexdigest()
    (workspace / 'provenance.json').write_text(json.dumps({'module': module, 'patchesBeforeGofmt': patches}, indent=2) + '\n')
    subprocess.run(['gofmt', '-w', 'figaroembedded', 'cmd/figaro-prototype', 'internal/check/figaro_memory.go', 'internal/lint/figaro_context.go', 'internal/lint/figaro_plaintext.go', 'internal/lint/lint.go', 'internal/core/config.go', 'internal/core/file.go', 'internal/regex/regex.go'], cwd=fork, check=True)
    print(workspace)


if __name__ == '__main__':
    main()
