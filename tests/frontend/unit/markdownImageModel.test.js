import {
    clearMarkdownImageSize,
    markdownImageDisplaySize,
    markdownImageResizePlan,
    parseMarkdownImageAlt,
    parseMarkdownImageSyntax,
    setMarkdownImageSize,
} from '../../../frontend/js/core/markdownImageModel.js';

describe('Markdown image sizing model', () => {
    test('parses an optional trailing size hint without exposing it as alt text', () => {
        expect(parseMarkdownImageAlt('Engelbart|100x145')).toEqual({
            alt: 'Engelbart',
            width: 100,
            height: 145,
            sized: true,
        });
        expect(parseMarkdownImageSyntax('![Engelbart|100x145](portrait.png "Portrait")')).toEqual({
            alt: 'Engelbart',
            src: 'portrait.png',
            title: 'Portrait',
            width: 100,
            height: 145,
        });
        expect(parseMarkdownImageAlt('Engelbart|wide')).toEqual({
            alt: 'Engelbart|wide',
            width: null,
            height: null,
            sized: false,
        });
    });

    test('sets, replaces, and clears only the authored dimension suffix', () => {
        expect(setMarkdownImageSize('![Portrait](portrait.png "Profile")', 190, 121))
            .toBe('![Portrait|190x121](portrait.png "Profile")');
        expect(setMarkdownImageSize('![Portrait|190x121](portrait.png "Profile")', 240, 153))
            .toBe('![Portrait|240x153](portrait.png "Profile")');
        expect(clearMarkdownImageSize('![Portrait|240x153](portrait.png "Profile")'))
            .toBe('![Portrait](portrait.png "Profile")');
    });

    test('fits initial geometry to the writing width without enlarging it', () => {
        expect(markdownImageDisplaySize({
            originalWidth: 640,
            originalHeight: 408,
            availableWidth: 320,
        })).toEqual({ width: 320, height: 204 });
        expect(markdownImageDisplaySize({
            width: 100,
            height: 145,
            originalWidth: 640,
            originalHeight: 408,
            availableWidth: 320,
        })).toEqual({ width: 100, height: 145 });
    });

    test('gives each handle its approved independent constraint', () => {
        expect(markdownImageResizePlan({
            mode: 'width',
            startWidth: 190,
            startHeight: 121,
            deltaX: 900,
            maximumWidth: 302,
            originalWidth: 240,
            originalHeight: 153,
        })).toEqual({ width: 302, height: 121 });
        expect(markdownImageResizePlan({
            mode: 'width',
            startWidth: 190,
            startHeight: 121,
            deltaX: -900,
            maximumWidth: 302,
            originalWidth: 240,
            originalHeight: 153,
        })).toEqual({ width: 1, height: 121 });

        expect(markdownImageResizePlan({
            mode: 'height',
            startWidth: 190,
            startHeight: 121,
            deltaY: 9000,
            originalWidth: 240,
            originalHeight: 153,
        })).toEqual({ width: 190, height: 1530 });
        expect(markdownImageResizePlan({
            mode: 'height',
            startWidth: 190,
            startHeight: 121,
            deltaY: -9000,
            originalWidth: 240,
            originalHeight: 153,
        })).toEqual({ width: 190, height: 1 });

        const rightLimited = markdownImageResizePlan({
            mode: 'proportional',
            startWidth: 265,
            startHeight: 121,
            deltaX: 900,
            deltaY: 900,
            maximumWidth: 302,
            maximumProportionalHeight: 320,
            originalWidth: 240,
            originalHeight: 153,
        });
        expect(rightLimited.width).toBe(302);
        expect(rightLimited.width / rightLimited.height).toBeCloseTo(265 / 121, 2);

        const bottomLimited = markdownImageResizePlan({
            mode: 'proportional',
            startWidth: 190,
            startHeight: 291,
            deltaX: 900,
            deltaY: 900,
            maximumWidth: 500,
            maximumProportionalHeight: 312,
            originalWidth: 240,
            originalHeight: 153,
        });
        expect(bottomLimited.height).toBe(312);
        expect(bottomLimited.width / bottomLimited.height).toBeCloseTo(190 / 291, 2);
    });
});
