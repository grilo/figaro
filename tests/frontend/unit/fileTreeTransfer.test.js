import { createFileTreeTransfer } from '../frontend/js/usecases/fileTreeTransfer.js';

describe('file-tree transfer use case', () => {
    test('prepares each source before copying and refreshes once after the batch', async () => {
        const prepareCopy = jest.fn().mockResolvedValue({ success: true });
        const copyPath = jest.fn()
            .mockResolvedValueOnce({ success: true, path: 'Archive/a.md' })
            .mockResolvedValueOnce({ success: true, path: 'Archive/report.pdf' });
        const refresh = jest.fn().mockResolvedValue(undefined);
        const transfer = createFileTreeTransfer({ prepareCopy, copyPath, refresh });
        const entries = [
            { path: 'a.md', type: 'file' },
            { path: 'report.pdf', type: 'file' },
        ];

        await expect(transfer.copy(entries, 'Archive')).resolves.toEqual({
            success: true,
            stage: 'complete',
            error: null,
            remaining: [],
            copiedPaths: ['Archive/a.md', 'Archive/report.pdf'],
        });
        expect(prepareCopy.mock.invocationCallOrder[0]).toBeLessThan(copyPath.mock.invocationCallOrder[0]);
        expect(prepareCopy).toHaveBeenNthCalledWith(2, 'report.pdf');
        expect(copyPath).toHaveBeenNthCalledWith(2, 'report.pdf', 'Archive');
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    test('refreshes after a partial failure and retains only unresolved sources', async () => {
        const prepareCopy = jest.fn().mockResolvedValue({ success: true });
        const copyPath = jest.fn()
            .mockResolvedValueOnce({ success: true, path: 'Archive/a.md' })
            .mockResolvedValueOnce({ success: false, error: 'Destination unavailable' });
        const refresh = jest.fn().mockResolvedValue(undefined);
        const transfer = createFileTreeTransfer({ prepareCopy, copyPath, refresh });
        const entries = [
            { path: 'a.md', type: 'file' },
            { path: 'report.pdf', type: 'file' },
        ];

        await expect(transfer.copy(entries, 'Archive')).resolves.toEqual({
            success: false,
            stage: 'copy',
            error: 'Destination unavailable',
            remaining: [{ path: 'report.pdf', type: 'file' }],
            copiedPaths: ['Archive/a.md'],
        });
        expect(refresh).toHaveBeenCalledTimes(1);
    });
});
