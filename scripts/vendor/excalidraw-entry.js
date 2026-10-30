// Vendor entry for the Excalidraw editor. scripts/vendor-excalidraw.mjs bundles
// this file, React, and Excalidraw into one IIFE that exposes a small imperative
// API as window.FigaroExcalidraw, so first-party code never imports React.
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import {
    Excalidraw,
    MainMenu,
    exportToSvg,
    getSceneVersion,
    loadFromBlob,
} from '@excalidraw/excalidraw';

// The canvas shows Figaro's surface through it. Exports never include a
// background, so drawings sit on whatever page or note displays them.
const transparentCanvas = { viewBackgroundColor: 'transparent' };

function initialData(scene, theme) {
    return {
        elements: scene?.elements || [],
        appState: { ...(scene?.appState || {}), ...transparentCanvas, theme },
        files: scene?.files || {},
        scrollToContent: true,
    };
}

export function mount(element, { scene = null, theme = 'light', onChange = null } = {}) {
    const root = createRoot(element);
    let api = null;
    let currentTheme = theme;
    const data = initialData(scene, theme);

    function render() {
        root.render(createElement(Excalidraw, {
            initialData: data,
            theme: currentTheme,
            excalidrawAPI: value => { api = value; },
            onChange: (elements, appState, files) => onChange?.({
                version: getSceneVersion(elements),
                elements,
                appState,
                files,
            }),
            // Web embeds load third-party pages and export as blank boxes.
            validateEmbeddable: () => false,
            UIOptions: {
                canvasActions: {
                    changeViewBackgroundColor: false,
                    loadScene: false,
                    saveToActiveFile: false,
                    saveAsImage: false,
                    export: false,
                    toggleTheme: null,
                },
            },
        }, createElement(MainMenu, null,
            createElement(MainMenu.DefaultItems.ClearCanvas),
            createElement(MainMenu.DefaultItems.Help),
        )));
    }
    render();

    return {
        setTheme(next) {
            if (next === currentTheme) return;
            currentTheme = next;
            render();
        },
        /** Show a newer saved scene, discarding undo history that no longer applies. */
        replaceScene(next) {
            if (!api) return;
            const nextData = initialData(next, currentTheme);
            api.resetScene();
            api.addFiles(Object.values(nextData.files));
            api.updateScene({ elements: nextData.elements, appState: nextData.appState });
            api.history.clear();
        },
        async exportSVG() {
            if (!api) throw new Error('Excalidraw is not ready');
            const svg = await exportToSvg({
                elements: api.getSceneElements(),
                appState: {
                    ...api.getAppState(),
                    exportEmbedScene: true,
                    exportWithDarkMode: false,
                    exportBackground: false,
                },
                files: api.getFiles(),
            });
            return svg.outerHTML;
        },
        unmount() {
            root.unmount();
            api = null;
        },
    };
}

// Reads the scene that exportToSvg embedded in an .excalidraw.svg file.
// Returns null for an empty file (a new drawing); any other SVG without an
// embedded scene is rejected so it is never overwritten with a blank drawing.
export async function loadSceneFromSVG(svgText) {
    if (!String(svgText || '').trim()) return null;
    if (!/payload-type:application\/vnd\.excalidraw\+json/.test(svgText)) {
        throw new Error('This SVG has no embedded Excalidraw scene, so it cannot be edited here.');
    }
    return loadFromBlob(new Blob([svgText], { type: 'image/svg+xml' }), null, null);
}
