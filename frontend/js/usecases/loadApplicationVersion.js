import { applicationVersionPresentation } from '../core/applicationVersionModel.js';

export async function loadApplicationVersion({
    readVersion,
    present,
    isActive = () => true,
}) {
    let presentation;
    try {
        presentation = applicationVersionPresentation(await readVersion());
    } catch (_error) {
        presentation = applicationVersionPresentation('');
    }

    if (!isActive()) {
        return { status: 'cancelled', presentation };
    }

    present(presentation);
    return { status: 'presented', presentation };
}
