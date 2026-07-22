/**
 * Small, local-first Markdown diagnostics.
 *
 * Markdown intentionally accepts a broad range of source, so these checks are
 * deliberately conservative: they flag incomplete structures and a few clear
 * readability mistakes without rewriting a user's document or imposing a
 * house style.
 */

const frontmatterDelimiter = /^(?:---|\.\.\.)[ \t]*$/;
const fenceStart = /^ {0,3}(`{3,}|~{3,})/;
const heading = /^ {0,3}(#{1,6})(?:[ \t]+|$)/;

function diagnostic(from, to, severity, message) {
    return {
        from,
        to: Math.max(from + 1, to),
        severity,
        source: 'Figaro Markdown',
        message,
    };
}

/**
 * Return Markdown diagnostics with CodeMirror document offsets for a source
 * string. Fenced code and YAML frontmatter are deliberately excluded from
 * prose-style checks, because their contents follow their own syntax rules.
 */
export function markdownDiagnostics(source) {
    const text = String(source ?? '');
    const lines = text.split('\n');
    const diagnostics = [];
    let position = 0;
    let previousHeadingLevel = 0;
    let openFence = null;
    const hasFrontmatter = lines[0]?.trim() === '---';
    let frontmatterOpen = hasFrontmatter;
    const frontmatterStart = hasFrontmatter ? 0 : null;

    for (let index = 0; index < lines.length; index++) {
        const rawLine = lines[index];
        const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;

        if (frontmatterOpen) {
            if (index > 0 && frontmatterDelimiter.test(line.trim())) {
                frontmatterOpen = false;
            }
            position += rawLine.length + 1;
            continue;
        }

        const currentFence = line.match(fenceStart);
        if (openFence) {
            const closesFence = currentFence
                && currentFence[1][0] === openFence.character
                && currentFence[1].length >= openFence.length
                && /^[ \t]*$/.test(line.slice(currentFence[0].length));
            if (closesFence) openFence = null;
            position += rawLine.length + 1;
            continue;
        }
        if (currentFence) {
            openFence = {
                character: currentFence[1][0],
                length: currentFence[1].length,
                from: position + currentFence[0].indexOf(currentFence[1]),
                to: position + currentFence[0].indexOf(currentFence[1]) + currentFence[1].length,
            };
            position += rawLine.length + 1;
            continue;
        }

        const headingMatch = line.match(heading);
        if (headingMatch) {
            const level = headingMatch[1].length;
            if (previousHeadingLevel && level > previousHeadingLevel + 1) {
                const from = position + headingMatch[0].indexOf(headingMatch[1]);
                diagnostics.push(diagnostic(
                    from,
                    from + level,
                    'warning',
                    `Heading jumps from level ${previousHeadingLevel} to level ${level}. Add an intervening level ${previousHeadingLevel + 1} heading or lower this heading level.`,
                ));
            }
            previousHeadingLevel = level;
        }

        const trailingWhitespace = line.match(/[ \t]+$/);
        // Exactly two spaces are a portable Markdown hard line break. Keep
        // that valid construct quiet while still flagging accidental padding.
        if (trailingWhitespace && trailingWhitespace[0] !== '  ') {
            const from = position + line.length - trailingWhitespace[0].length;
            diagnostics.push(diagnostic(
                from,
                position + line.length,
                'warning',
                'Remove trailing whitespace. Exactly two final spaces are kept as the Markdown hard-line-break syntax.',
            ));
        }

        position += rawLine.length + 1;
    }

    if (frontmatterOpen && frontmatterStart !== null) {
        diagnostics.push(diagnostic(
            frontmatterStart,
            frontmatterStart + 3,
            'error',
            'Frontmatter starts here but never closes. Add a closing --- or ... line before the Markdown body.',
        ));
    }
    if (openFence) {
        diagnostics.push(diagnostic(
            openFence.from,
            openFence.to,
            'error',
            `This ${openFence.character.repeat(openFence.length)} code fence never closes. Add a matching closing fence on its own line.`,
        ));
    }

    return diagnostics;
}

export function markdownLinter(view) {
    return markdownDiagnostics(view.state.doc.toString());
}
