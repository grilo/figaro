import { applyProvisionalActivityDate, formatActivityMarginDate, remapActivityScope, activityDateKey, activityEventsForPassages, groupActivityPassages, matchActivityLines, projectActivity } from '../../../frontend/js/core/activityModel.js';

const oldDate = Date.parse('2026-09-03T12:00:00Z') / 1000;
const newDate = Date.parse('2026-09-07T12:00:00Z') / 1000;
function recorded(source) { return { source, revision: 'old', lines: source.split('\n').map(() => ({ event: 0 })), events: [{ revision: 'old', timestamp: oldDate, parents: [] }] }; }

test('prepending a meeting preserves old passage dates and marks only new text unrecorded', () => {
    const before = '# Old meeting\n\nKeep the launch date.\n\nAnother paragraph.';
    const source = '# New meeting\n\nNew discussion.\n\n' + before;
    const result = projectActivity({ source, recorded: recorded(before), timeZone: 'UTC' });
    expect(result.passages.map(p => p.status)).toEqual(['unrecorded', 'unrecorded', 'recorded', 'recorded', 'recorded']);
    expect(result.passages.slice(2).every(p => p.date === '2026-09-03')).toBe(true);
    expect(source.slice(result.passages[2].from, result.passages[2].to)).toBe('# Old meeting');
});

test('consecutive dates share one group across headings, authored date links and diagrams', () => {
    const source = '# Decision\n\nThree fields.\n\n---\n\n## Presentation\n\n[Tomorrow](2026-09-08.md)\n\n```mermaid\nflowchart LR\nA --> B\n```';
    const result = projectActivity({ source, recorded: recorded(source), timeZone: 'UTC' });
    const groups = groupActivityPassages(result.passages);
    expect(groups).toHaveLength(1);
    expect(groups[0].date).toBe('2026-09-03');
    expect(groups[0].passages.at(-1).excerpt).toContain('```mermaid');
});

test('returning to a prior date creates another marker and unknown work breaks inheritance', () => {
    const passages = ['2026-09-07', '2026-09-07', '2026-09-03', '2026-09-07', '', '2026-09-07'].map((date, i) => ({ date, status: date ? 'recorded' : 'unknown', from: i * 10, to: i * 10 + 5 }));
    expect(groupActivityPassages(passages).map(g => g.key)).toEqual(['2026-09-07', '2026-09-03', '2026-09-07', 'unknown', '2026-09-07']);
});

test('activity groups use full local dates rather than UTC days or display labels', () => {
    const timestamp = Date.parse('2026-09-07T00:30:00Z') / 1000;
    expect(activityDateKey(timestamp, 'America/New_York')).toBe('2026-09-06');
    expect(activityDateKey(timestamp, 'Europe/Madrid')).toBe('2026-09-07');
    expect(groupActivityPassages([{ date: '2025-09-07', status: 'recorded' }, { date: '2026-09-07', status: 'recorded' }])).toHaveLength(2);
});

test('editing one paragraph cannot refresh neighboring headings or prose', () => {
    const source = '# Heading\n\nOld paragraph.\n\nUntouched paragraph.';
    const result = projectActivity({ source: source.replace('Old paragraph.', 'New paragraph.'), recorded: recorded(source), timeZone: 'UTC' });
    expect(result.passages.map(p => p.status)).toEqual(['recorded', 'unrecorded', 'recorded']);
});

test('frontmatter is omitted, Unicode offsets stay in UTF-16, and CRLF matches saved LF', () => {
    const source = '---\ntitle: Note\n---\n\n# Olá 👋\n\nToday’s notes.';
    const result = projectActivity({ source, recorded: recorded(source.replaceAll('\n', '\r\n')), timeZone: 'UTC' });
    expect(result.passages.map(p => source.slice(p.from, p.to))).toEqual(['# Olá 👋', 'Today’s notes.']);
    expect(result.passages.every(p => p.status === 'recorded')).toBe(true);
});

test('unique moved text keeps attribution while a newly inserted duplicate gets no old date', () => {
    expect(matchActivityLines(['Alpha', 'Beta', 'Gamma'], ['Gamma', 'Alpha', 'Beta'])).toEqual([2, 0, 1]);
    expect(matchActivityLines(['top', 'same', 'bottom'], ['new', 'same', 'top', 'same', 'bottom'])).toEqual([-1, -1, 0, 1, 2]);
});

test('passage history retains earlier edits, deduplicates shared ancestors and bounds cycles', () => {
    const events = [{ timestamp: oldDate, parents: [] }, { timestamp: newDate, parents: [0] }, { timestamp: newDate, parents: [1, 0, 2] }];
    expect(activityEventsForPassages([{ events: [2, 1] }], events).map(e => e.id)).toEqual([2, 1, 0]);
});

test('partial history and unrecorded notes never receive fabricated dates', () => {
    const source = '# Heading\n\nOlder text.';
    const result = projectActivity({ source, recorded: { ...recorded(source), partial: true, lines: source.split('\n').map(() => ({ event: -1 })) }, timeZone: 'UTC' });
    expect(result.partial).toBe(true);
    expect(result.passages.every(p => p.status === 'unknown' && p.date === '')).toBe(true);
    expect(projectActivity({ source, recorded: null, timeZone: 'UTC' }).passages.every(p => p.status === 'unrecorded')).toBe(true);
});

test('ambiguous large repeated passages show unknown rather than a false recent day', () => {
 const before='start\n'+ 'same\nother\n'.repeat(400)+'end';
 const source='changed start\n'+'other\nsame\n'.repeat(400)+'changed end';
 expect(matchActivityLines(before.split('\n'),source.split('\n'))[100]).toBe(-2);
});

test('activity scope shifts after a prepend and disappears when its passage is deleted', () => {
 expect(remapActivityScope({from:10,to:20},[{from:0,to:0,insertedLength:5}])).toEqual({from:15,to:25});
 expect(remapActivityScope({from:10,to:20},[{from:10,to:20,insertedLength:0}])).toBeNull();
 expect(remapActivityScope({from:10,to:20},[{from:15,to:16,insertedLength:3}])).toEqual({from:10,to:22});
});

test('a draft replacement retains earlier passage events while a new insertion has none', () => {
 const before = '# Meeting\n\nPrevious wording.\n\nKeep this.';
 const result = projectActivity({ source: '# Meeting\n\nCompletely rewritten.\n\nKeep this.\n\nNew passage.', recorded: recorded(before), timeZone: 'UTC' });
 expect(result.passages[1]).toMatchObject({status:'unrecorded',events:[0],date:''});
 expect(result.passages.at(-1)).toMatchObject({status:'unrecorded',events:[]});
});


test.each([
    ['2026-09-07', '7 Sep 26'],
    ['2025-09-07', '7 Sep 25'],
    ['2000-01-01', '1 Jan 00'],
    ['2027-12-31', '31 Dec 27'],
    ['', ''],
])('margin date %s always includes its two-digit year in day-month-year order', (key, label) => {
    expect(formatActivityMarginDate(key)).toBe(label);
});


test('temporary observed dates fill pending attribution while confirmed Git dates take precedence', () => {
    const draft = { from: 0, to: 5, status: 'unrecorded', date: '', events: [] };
    expect(applyProvisionalActivityDate(draft, '2026-09-07'))
        .toMatchObject({ status: 'unrecorded', date: '2026-09-07', provisional: true });
    expect(applyProvisionalActivityDate(draft, '')).toBe(draft);
    const recorded = { ...draft, status: 'recorded', date: '2026-09-08' };
    expect(applyProvisionalActivityDate(recorded, '2026-09-07')).toBe(recorded);
});

test('recorded and freshly edited passages on the same day share one marker with pending status', () => {
    const recorded = { from: 0, to: 5, status: 'recorded', date: '2026-09-07' };
    const draft = { from: 7, to: 12, status: 'unrecorded', date: '2026-09-07', provisional: true };
    const groups = groupActivityPassages([recorded, draft, { ...recorded, from: 14, to: 20 }]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: '2026-09-07', provisional: true, from: 0, to: 20 });
    expect(groups[0].passages).toHaveLength(3);
});
