import {
    homeCollections,
    localDatePath,
    todayNotePlan,
    todayPresentation,
} from '../frontend/js/core/homeModel.js';

describe('Home model', () => {
    const tree = [
        {
            name: 'Inbox', path: 'Inbox', type: 'directory', children: [
                { name: 'older.md', path: 'Inbox/older.md', type: 'file', mtime: 1 },
                { name: 'newer.md', path: 'Inbox/newer.md', type: 'file', mtime: 3 },
            ],
        },
        {
            name: 'Projects', path: 'Projects', type: 'directory', children: [
                { name: 'Alpha.md', path: 'Projects/Alpha.md', type: 'file', mtime: 2 },
            ],
        },
        { name: 'Today.md', path: '2024-01-15.md', type: 'file', mtime: 4 },
        { name: 'Reference.md', path: 'Reference.md', type: 'file', mtime: 2 },
    ];

    test('uses local calendar components rather than UTC conversion', () => {
        const date = new Date(2024, 0, 15, 23, 30, 0);
        expect(localDatePath(date)).toBe('2024-01-15.md');
        expect(todayPresentation(date, 'en-US')).toEqual({
            path: '2024-01-15.md',
            eyebrow: 'Monday, January 15',
        });
    });

    test('plans an open for an existing note and a portable create for a missing note', () => {
        expect(todayNotePlan('2024-01-15.md', tree)).toEqual({
            kind: 'open', path: '2024-01-15.md', mtime: 4,
        });
        expect(todayNotePlan('2024-01-16.md', tree)).toEqual({
            kind: 'create',
            directory: 'Inbox',
            path: 'Inbox/2024-01-16.md',
            content: '# 2024-01-16\n\n',
        });
        expect(todayNotePlan('../outside.md', tree).kind).toBe('invalid');
    });

    test('prefers an Inbox daily note while retaining a legacy root-note fallback', () => {
        const inboxToday = {
            name: '2024-01-15.md', path: 'Inbox/2024-01-15.md', type: 'file', mtime: 8,
        };
        const inboxTree = tree.map(item => item.path === 'Inbox'
            ? { ...item, children: [...item.children, inboxToday] }
            : item);

        expect(todayNotePlan('2024-01-15.md', inboxTree)).toEqual({
            kind: 'open', path: 'Inbox/2024-01-15.md', mtime: 8,
        });
        expect(homeCollections({ tree: inboxTree, todayPath: '2024-01-15.md' }).todayExists).toBe(true);
    });

    test('derives Inbox, explicit/default pins, and a stable rediscovery note without changing the tree', () => {
        const result = homeCollections({
            tree,
            styles: { entries: { Projects: { pinned: true } } },
            recentPaths: ['Projects/Alpha.md'],
            todayPath: '2024-01-15.md',
            rediscoverySeed: '2024-01-15.md',
        });

        expect(result.inbox.map(item => item.path)).toEqual(['Inbox/newer.md', 'Inbox/older.md']);
        expect(result.inboxCount).toBe(2);
        expect(result.pinned.map(item => item.path)).toEqual(['Inbox', 'Projects']);
        expect(result.rediscover.path).toBe('Reference.md');
        expect(result.todayExists).toBe(true);
        expect(tree[0].children).toHaveLength(2);
    });

    test('honors an explicit Inbox unpin', () => {
        const result = homeCollections({
            tree,
            styles: { entries: { Inbox: { pinned: false } } },
            todayPath: '2024-01-15.md',
        });
        expect(result.pinned).toEqual([]);
    });

    test('keeps the full Inbox count when the visible list is bounded', () => {
        const result = homeCollections({ tree, todayPath: '2024-01-15.md', limit: 1 });
        expect(result.inbox.map(item => item.path)).toEqual(['Inbox/newer.md']);
        expect(result.inboxCount).toBe(2);
    });
});
