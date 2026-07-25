import { createLocalStateStorage } from '../frontend/js/adapters/localStateStorage.js';

describe('local state storage adapter', () => {
    test('exposes storage effects through a small key-value port', () => {
        const values = new Map();
        const storage = {
            getItem: jest.fn(key => values.get(key) ?? null),
            setItem: jest.fn((key, value) => values.set(key, value)),
            removeItem: jest.fn(key => values.delete(key)),
        };
        const adapter = createLocalStateStorage(storage);

        expect(adapter.available()).toBe(true);
        adapter.write('width', 320);
        expect(adapter.read('width')).toBe('320');
        adapter.remove('width');
        expect(adapter.read('width')).toBeNull();
    });

    test('reports unavailable storage without leaking the probe failure', () => {
        const adapter = createLocalStateStorage({
            setItem() {
                throw new Error('denied');
            },
            removeItem: jest.fn(),
            getItem: jest.fn(),
        });
        expect(adapter.available()).toBe(false);
    });
});
