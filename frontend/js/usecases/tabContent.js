/** Resolve a captured immutable buffer only at a consumer's read boundary. */
export function readTabContent(tab) {
    const content = tab?._content;
    return typeof content === 'string' ? content : content?.readContent?.();
}
