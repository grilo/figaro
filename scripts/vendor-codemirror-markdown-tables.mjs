import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const entry = path.join(
    root,
    'node_modules/codemirror-markdown-tables/dist/codemirror-markdown-tables.js',
);
const outfile = path.join(root, 'frontend/vendored/codemirror-markdown-tables/index.js');

function replaceOnce(source, expected, replacement, label) {
    const occurrences = source.split(expected).length - 1;
    if (occurrences !== 1) {
        throw new Error(`Unable to apply ${label}: expected one upstream match, found ${occurrences}`);
    }
    return source.replace(expected, replacement);
}

export function addFigaroMarkdownTableIntegration(source) {
    let patched = replaceOnce(
        source,
        'import { DocInput as Ko, highlightingFor as Ps, syntaxHighlighting as Ms, syntaxTree as Hs, syntaxTreeAvailable as Bs } from "@codemirror/language";',
        'import { DocInput as Ko, foldedRanges as Fg, highlightingFor as Ps, syntaxHighlighting as Ms, syntaxTree as Hs, syntaxTreeAvailable as Bs } from "@codemirror/language";',
        'folded-range import',
    );
    patched = replaceOnce(
        patched,
        `function hf(e, t) {
  return Cs.replace(cf(e, t));
}
function uf(e, t) {
  const n = new Os();
  for (const o of e)
    n.add(o.from, o.to, hf(o, t));
  return n.finish();
}`,
        `function hf(e, t) {
  return Cs.replace(cf(e, t));
}
function uf(e, t) {
  const n = new Os();
  for (const o of e) {
    const s = t.doc.lineAt(o.from).to;
    const i = t.doc.lineAt(o.to);
    let r = false;
    Fg(t).between(s, i.to, (l, a) => {
      if (l === s && a >= i.from && a <= i.to) r = true;
    });
    if (r) continue;
    n.add(o.from, o.to, hf(o, t));
  }
  return n.finish();
}`,
        'fold-aware table decorations',
    );
    patched = replaceOnce(
        patched,
        '    if (Wh(t)) return Mn(t.state);',
        '    if (Wh(t) || Fg(t.startState) !== Fg(t.state)) return Mn(t.state);',
        'fold-effect table rebuild',
    );
    patched = replaceOnce(
        patched,
        '    const o = this.tableDescription, i = ih(() => {',
        `    const o = this.tableDescription;
    n.classList.add("cm-block-widget", "cm-block-widget--table");
    const sourceLines = o.table.rowCount + 1;
    n.classList.add("cm-source-footprint", "cm-source-footprint--scroll");
    n.dataset.sourceFootprint = "table";
    n.dataset.sourceFootprintState = "overflow";
    n.dataset.sourceLines = String(sourceLines);
    n.__figaroSourceFootprintText = o.table.text.toString();
    n.style.setProperty("--cm-source-footprint-lines", n.dataset.sourceLines);
    n.style.setProperty("--cm-source-footprint-height", String(sourceLines * t.defaultLineHeight) + "px");
    t.requestMeasure({
      read: () => n.scrollHeight > n.clientHeight + 1,
      write: (overflows) => {
        n.dataset.sourceFootprintState = overflows ? "overflow" : "underflow";
      }
    });
    const deleteTable = () => {
      t.dispatch({
        annotations: he("table.delete"),
        changes: { from: o.from, to: o.to },
        selection: t.state.selection
      });
      t.focus();
    };
    const deleteButton = n.ownerDocument.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "ui-button ui-button--danger-ghost tbl-delete-table-button";
    deleteButton.textContent = "Delete table";
    deleteButton.title = "Delete table";
    deleteButton.setAttribute("aria-label", "Delete table");
    deleteButton.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    deleteButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      deleteTable();
    });
    n.append(deleteButton);
    const i = ih(() => {`,
        'direct delete-table control',
    );
    patched = replaceOnce(
        patched,
        `        onDelete: () => {
          t.dispatch({
            annotations: he("table.delete"),
            changes: { from: o.from, to: o.to },
            selection: t.state.selection
          }), t.focus();
        }`,
        '        onDelete: deleteTable',
        'shared delete-table action',
    );
    return patched;
}

await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    target: 'es2020',
    minify: true,
    external: ['@codemirror/*', '@lezer/*'],
    outfile,
    plugins: [{
        name: 'figaro-markdown-table-integration',
        setup(buildContext) {
            buildContext.onLoad({ filter: /codemirror-markdown-tables\.js$/ }, async args => ({
                contents: addFigaroMarkdownTableIntegration(await fs.readFile(args.path, 'utf8')),
                loader: 'js',
            }));
        },
    }],
});
