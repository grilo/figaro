import { bindRightPaneLauncher } from '../../../frontend/js/rightPaneLauncher.js';

function fixture() {
    document.body.innerHTML = '<textarea id="editor"></textarea><button id="launcher">Pane</button><input id="sidebar">';
    const editor = document.getElementById('editor'), button = document.getElementById('launcher');
    const view = { get hasFocus() { return document.activeElement === editor; } };
    const activate = jest.fn();
    const destroy = bindRightPaneLauncher(button, { getEditorView: () => view, activate });
    return { editor, button, activate, destroy };
}
const down = (button, mouseButton = 0) => {
    const event = new MouseEvent('mousedown', { button: mouseButton, bubbles: true, cancelable: true });
    button.dispatchEvent(event); return event;
};
const click = button => button.dispatchEvent(new MouseEvent('click', { detail: 1, bubbles: true }));

test('pointer pane launch prevents the browser focus transfer and asks the pane to leave editor focus alone', () => {
    const { editor, button, activate, destroy } = fixture();
    editor.focus(); editor.setSelectionRange(1, 1);
    expect(down(button).defaultPrevented).toBe(true); click(button);
    expect(activate).toHaveBeenCalledWith({ focusPane: false });
    expect(document.activeElement).toBe(editor);
    destroy(); expect(down(button).defaultPrevented).toBe(false);
    click(button); expect(activate).toHaveBeenCalledTimes(1);
});

test('keyboard and assistive activation keep deliberate pane entry even after an abandoned pointer press', () => {
    const { editor, button, activate, destroy } = fixture();
    editor.focus(); down(button); button.focus(); button.click();
    expect(activate).toHaveBeenCalledWith({ focusPane: true });
    expect(document.activeElement).toBe(button); destroy();
});

test('clicking from outside the editor and secondary mouse buttons retain normal focus behavior', () => {
    const { editor, button, activate, destroy } = fixture();
    document.getElementById('sidebar').focus();
    expect(down(button).defaultPrevented).toBe(false); click(button);
    expect(activate).toHaveBeenLastCalledWith({ focusPane: true });
    editor.focus(); expect(down(button, 2).defaultPrevented).toBe(false);
    destroy();
});

test('a later pane completion never refocuses the editor after an explicit sidebar click', async () => {
    const { editor, button, destroy } = fixture(); destroy();
    let finish;
    const pending = new Promise(resolve => { finish = resolve; });
    const view = { get hasFocus() { return document.activeElement === editor; } };
    const activate = jest.fn(() => pending);
    const unbind = bindRightPaneLauncher(button, { getEditorView: () => view, activate });
    editor.focus(); down(button); click(button);
    expect(activate).toHaveBeenCalledWith({ focusPane: false });
    const sidebar = document.getElementById('sidebar'); sidebar.focus();
    finish(); await pending;
    expect(document.activeElement).toBe(sidebar); unbind();
});
