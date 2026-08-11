export const FIGARO_APPLICATION_NAME = 'Figaro';

/** Put the most specific document identity first for task switchers. */
export function windowTitleForTab(tab) {
    const title = String(tab?.title || '').trim();
    return title ? `${title} — ${FIGARO_APPLICATION_NAME}` : FIGARO_APPLICATION_NAME;
}
