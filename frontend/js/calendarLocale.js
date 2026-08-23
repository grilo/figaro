import { dateFromISO } from './core/dueDateModel.js';

export function currentCalendarLocale(rootNavigator = globalThis.navigator) {
    const candidates = [
        ...(Array.isArray(rootNavigator?.languages) ? rootNavigator.languages : []),
        rootNavigator?.language,
        Intl.DateTimeFormat().resolvedOptions().locale,
    ];
    for (const candidate of candidates) {
        if (!candidate) continue;
        try {
            new Intl.DateTimeFormat(candidate).format();
            return candidate;
        } catch (_) {
            // Some WebKitGTK builds expose C/POSIX as a navigator language.
        }
    }
    return 'en-US';
}

export function formatCalendarMonth(year, month, locale) {
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
        .format(new Date(year, month, 1, 12));
}

export function formatCalendarDate(dateStr, locale) {
    const date = dateFromISO(dateStr);
    return date
        ? new Intl.DateTimeFormat(locale, {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        }).format(date)
        : dateStr;
}

export default { currentCalendarLocale, formatCalendarDate, formatCalendarMonth };
