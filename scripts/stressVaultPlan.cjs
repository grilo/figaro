const stressVaultDefaults = Object.freeze({
    documentCount: 10000,
    hugeDocumentCount: 5,
    hugeLineCount: 10000,
});

const smallNeedle = 'figaro-common-scale-term';
const hugeNeedle = 'figaro-rare-tail-term';
const smallSourcePath = '2026-08-11.md';
const hugeSourcePath = 'Research/Large/Huge Source.md';
const directoryFamilies = [
    'Areas',
    'Projects',
    'Archive',
    'Reference',
    'Journal',
    'Teams',
    'Research',
    'Inbox',
];

function positiveInteger(value, label) {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 1) {
        throw new Error(`${label} must be a positive integer`);
    }
    return number;
}

function normalizeStressVaultOptions(options = {}) {
    const normalized = {
        documentCount: positiveInteger(
            options.documentCount ?? stressVaultDefaults.documentCount,
            'documentCount',
        ),
        hugeDocumentCount: positiveInteger(
            options.hugeDocumentCount ?? stressVaultDefaults.hugeDocumentCount,
            'hugeDocumentCount',
        ),
        hugeLineCount: positiveInteger(
            options.hugeLineCount ?? stressVaultDefaults.hugeLineCount,
            'hugeLineCount',
        ),
    };
    if (normalized.documentCount < 2) {
        throw new Error('documentCount must leave room for one small and one huge source');
    }
    if (normalized.hugeDocumentCount >= normalized.documentCount) {
        throw new Error('hugeDocumentCount must be smaller than documentCount');
    }
    return normalized;
}

function smallCopyPath(index) {
    const family = directoryFamilies[index % directoryFamilies.length];
    const collection = String(Math.floor(index / directoryFamilies.length) % 25).padStart(2, '0');
    const topic = String(Math.floor(index / (directoryFamilies.length * 25)) % 10).padStart(2, '0');
    const section = String(Math.floor(index / 997) % 7).padStart(2, '0');
    const file = `note-${String(index).padStart(5, '0')}.md`;

    switch (index % 4) {
    case 0:
        return `${family}/collection-${collection}/${file}`;
    case 1:
        return `${family}/collection-${collection}/topic-${topic}/${file}`;
    case 2:
        return `${family}/collection-${collection}/topic-${topic}/section-${section}/${file}`;
    default:
        return `${family}/collection-${collection}/topic-${topic}/section-${section}/deep/segment/${file}`;
    }
}

function smallDocumentContent() {
    return [
        '# Scale fixture note',
        '',
        `This compact note contains the shared search marker ${smallNeedle}.`,
        '',
        '- [ ] Review this generated note #todo',
        '',
        'It links back to [2026-08-11](/2026-08-11.md) and marks [2026-08-11]().',
        '',
        'The files are intentional byte-for-byte copies with unique paths.',
        '',
    ].join('\n');
}

function hugeDocumentContent(lineCount = stressVaultDefaults.hugeLineCount) {
    const count = positiveInteger(lineCount, 'hugeLineCount');
    const lines = [
        '# Huge scale fixture',
        '',
        `This large note also contains ${smallNeedle}.`,
        '- [ ] Inspect the large editor buffer #review',
        '[2026-08-11](/2026-08-11.md)',
    ];
    while (lines.length < count) {
        const lineNumber = lines.length + 1;
        if (lineNumber === count) {
            lines.push(`Tail line ${lineNumber}: ${hugeNeedle}`);
        } else if (lineNumber % 250 === 0) {
            lines.push(`## Generated section ${String(lineNumber / 250).padStart(2, '0')}`);
        } else {
            lines.push(`Synthetic line ${String(lineNumber).padStart(5, '0')} keeps the large editor and parser workload deterministic.`);
        }
    }
    return `${lines.join('\n')}\n`;
}

function buildStressVaultPlan(options = {}) {
    const normalized = normalizeStressVaultOptions(options);
    const smallDocumentCount = normalized.documentCount - normalized.hugeDocumentCount;
    const documents = [
        { path: smallSourcePath, template: 'small', source: true },
        { path: hugeSourcePath, template: 'huge', source: true },
    ];

    for (let index = 1; index < normalized.hugeDocumentCount; index += 1) {
        documents.push({
            path: `Research/Large/huge-copy-${String(index).padStart(3, '0')}.md`,
            template: 'huge',
            source: false,
        });
    }
    for (let index = 1; index < smallDocumentCount; index += 1) {
        documents.push({ path: smallCopyPath(index), template: 'small', source: false });
    }

    return {
        ...normalized,
        smallDocumentCount,
        sources: { small: smallSourcePath, huge: hugeSourcePath },
        needles: { common: smallNeedle, rare: hugeNeedle },
        documents,
    };
}

module.exports = {
    buildStressVaultPlan,
    hugeDocumentContent,
    normalizeStressVaultOptions,
    smallDocumentContent,
    stressVaultDefaults,
};
