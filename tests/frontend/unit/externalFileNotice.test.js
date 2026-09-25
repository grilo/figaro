import { setState } from '../frontend/js/state.js';
import { initExternalFileNotice } from '../frontend/js/externalFileNotice.js';

describe('outside-the-vault notice', () => {
    let element;
    let stop;

    beforeEach(() => {
        document.body.innerHTML = `
            <div id="external-file-notice" class="ui-notice ui-notice--info external-file-notice" role="status" hidden>
                <span class="external-file-notice-text"></span>
                <button type="button" class="ui-button ui-button--quiet external-file-notice-import"></button>
            </div>`;
        element = document.getElementById('external-file-notice');
        setState('openTabs', [
            { id: 'Inbox/note.md', type: 'file', path: 'Inbox/note.md', title: 'note.md' },
            { id: 'external:external-1', type: 'file', path: '/home/writer/README.md', title: 'README.md', externalFileId: 'external-1' },
        ]);
        setState('activeTabId', 'Inbox/note.md');
    });

    afterEach(() => {
        stop?.();
        setState('openTabs', []);
        setState('activeTabId', null);
    });

    test('appears only while a file from outside the vault is active and imports it', async () => {
        const onImport = jest.fn().mockResolvedValue('README.md');
        stop = initExternalFileNotice({ element, onImport });
        expect(element.hidden).toBe(true);

        setState('activeTabId', 'external:external-1');
        expect(element.hidden).toBe(false);
        expect(element.getAttribute('role')).toBe('status');
        expect(element.querySelector('.external-file-notice-text').textContent)
            .toBe('Outside the vault. Edits save to the original file and are not kept in history.');
        const button = element.querySelector('.external-file-notice-import');
        expect(button.textContent).toBe('Import to vault');
        expect(button.getAttribute('aria-label')).toBe('Import to vault: README.md');

        button.click();
        expect(button.disabled).toBe(true);
        await Promise.resolve();
        await Promise.resolve();
        expect(onImport).toHaveBeenCalledWith(expect.objectContaining({ externalFileId: 'external-1' }));
        expect(button.disabled).toBe(false);

        setState('activeTabId', 'Inbox/note.md');
        expect(element.hidden).toBe(true);
    });
});
