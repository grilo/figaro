import { localWritingParagraph } from './core/writingParagraphModel.js';

/** The pinned unmatched-pair rule is paragraph-local and reports relative indices.
 * Rebase only its input, avoiding sentence-splitter's document-prefix allocation.
 * A fresh visitor also scopes its IgnoreNodeManager to this paragraph.
 */
export function localParagraphRule(rule) {
    return (context, options) => ({
        [context.Syntax.Paragraph](node) {
            const localContext = { Syntax: context.Syntax, RuleError: context.RuleError,
                report: (_, error) => context.report(node, error) };
            return rule(localContext, options)[context.Syntax.Paragraph](localWritingParagraph(node));
        },
    });
}
