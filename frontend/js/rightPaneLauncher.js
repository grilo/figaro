/** Preserve typing focus on pointer activation, without changing keyboard entry.
 * Prevent the browser's mousedown focus transfer instead of refocusing after an
 * async pane opens: later completion must never override the user's next click.
 */
export function bindRightPaneLauncher(button, { getEditorView, activate }) {
    if (!button) return () => {};
    let pointerEditor = null;
    const onMouseDown = event => {
        pointerEditor = null;
        const view = getEditorView?.();
        if (event.button !== 0 || !view?.hasFocus) return;
        pointerEditor = view;
        event.preventDefault();
    };
    const onClick = event => {
        const preserve = event.detail > 0 && pointerEditor?.hasFocus
            && pointerEditor === getEditorView?.();
        pointerEditor = null;
        activate({ focusPane: !preserve });
    };
    button.addEventListener('mousedown', onMouseDown);
    button.addEventListener('click', onClick);
    return () => {
        pointerEditor = null;
        button.removeEventListener('mousedown', onMouseDown);
        button.removeEventListener('click', onClick);
    };
}
