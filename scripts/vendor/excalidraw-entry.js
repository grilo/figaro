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

export function mount(element, { scene = null, theme = 'light', onChange = null } = {}) {
    const root = createRoot(element);
    let api = null;
    let currentTheme = theme;
    const initialData = {
        elements: scene?.elements || [],
        appState: { ...(scene?.appState || {}), theme },
        files: scene?.files || {},
        scrollToContent: true,
    };

    function render() {
        root.render(createElement(Excalidraw, {
            initialData,
            theme: currentTheme,
            excalidrawAPI: value => { api = value; },
            onChange: (elements, appState, files) => onChange?.({
                version: getSceneVersion(elements),
                elements,
                appState,
                files,
            }),
            UIOptions: {
                canvasActions: {
                    loadScene: false,
                    saveToActiveFile: false,
                    saveAsImage: false,
                    export: false,
                    toggleTheme: null,
                },
            },
        }, createElement(MainMenu, null,
            createElement(MainMenu.DefaultItems.ClearCanvas),
            createElement(MainMenu.DefaultItems.ChangeCanvasBackground),
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
        sceneVersion: () => (api ? getSceneVersion(api.getSceneElementsIncludingDeleted()) : 0),
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
// Returns null for an SVG without an embedded scene (for example a new file).
export async function loadSceneFromSVG(svgText) {
    if (!/payload-type:application\/vnd\.excalidraw\+json/.test(svgText)) return null;
    return loadFromBlob(new Blob([svgText], { type: 'image/svg+xml' }), null, null);
}
