import { formatDesignSystemBundle } from '../../../scripts/designSystemBundle.js';

test('catalogue generation removes trailing comment whitespace without altering literal contents', () => {
    const source = '/* documentation\n    \nend  \n*/\nconst text = `/* literal  \n    \n*/`;\n// final comment  \n';
    const expected = '/* documentation\n\nend\n*/\nconst text = `/* literal  \n    \n*/`;\n// final comment\n';
    expect(formatDesignSystemBundle(source)).toBe(expected);
    expect(formatDesignSystemBundle(expected)).toBe(expected);
});
