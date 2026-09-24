/** Bounded editorial context: no document state, dictionaries or I/O. */
import { writingAcronymDefinitions } from './writingTextlintModel.js';

function contextAt(raw, { text }, radius = 160) {
    return {
        before: text.slice(Math.max(0, raw.from - radius), raw.from).split(/\n[ \t]*\n/u).at(-1),
        after: text.slice(raw.to, raw.to + radius).split(/\n[ \t]*\n/u)[0],
    };
}

// These familiar words carry distinctions that an isolated synonym list cannot
// improve. Phrase-level redundancy and reviewed complex vocabulary still run.
const ordinaryWording = new Set(['remain', 'remains', 'remained', 'contains', 'contain',
    'however', 'provide', 'provides', 'provided', 'identify', 'identifies', 'identified',
    'indicate', 'indicates', 'indicated', 'retain', 'retains', 'retained', 'reflect',
    'reflects', 'reflected', 'establish', 'establishes', 'established', 'equivalent', 'multiple', 'i.e.']);

// Words that spell out an acronym are the term being defined, not wording to
// simplify: “service level objective (SLO)” or “SLO (service level objective)”.
const wordsPattern = '(?:[ \\t]+[\\p{L}][\\p{L}’\'-]*)';
const forwardDefinition = new RegExp(`^(${wordsPattern}{0,4})[ \\t]+\\(([A-Z]{3,5})s?\\)`, 'u');
const reverseOpening = /\b([A-Z]{3,5})s?[ \t]+\(((?:[\p{L}][\p{L}’'-]*[ \t]+){0,7})$/u;
const reverseClosing = new RegExp(`^(${wordsPattern}{0,7})\\)`, 'u');
function acronymExpansion(raw, projection) {
    const { before, after } = contextAt(raw, projection, 96);
    const forward = forwardDefinition.exec(after);
    if (forward) {
        const following = forward[1].trim().split(/\s+/u).filter(Boolean);
        // The acronym's initials cover the final words, so this word must be among them.
        if (following.length >= forward[2].length) return false;
        const leading = before.match(/[\p{L}][\p{L}’'-]*/gu)?.slice(-7) || [];
        return writingAcronymDefinitions(`${[...leading, raw.actual, ...following].join(' ')} (${forward[2]})`, forward[2]).length > 0;
    }
    const opening = reverseOpening.exec(before), closing = opening && reverseClosing.exec(after);
    return Boolean(closing) && writingAcronymDefinitions(`${opening[1]} (${opening[2]}${raw.actual}${closing[1]})`, opening[1]).length > 0;
}

export function writingWordinessContext(raw, projection) {
    const word = raw.actual?.toLowerCase();
    if (ordinaryWording.has(word)) return true;
    if (raw.actual && acronymExpansion(raw, projection)) return true;
    if (!['function', 'request', 'parameters', 'type', 'address', 'it is', 'forward', 'option', 'minimum', 'maximum', 'attempt', 'currently', 'immediately'].includes(word)) return false;
    const { before, after } = contextAt(raw, projection), context = before + ' ' + after;
    if (word === 'currently') return /^\s+(?:running|waiting|active|enabled|disabled|available|selected|open|closed)\b/iu.test(after);
    if (word === 'immediately') return /\b(?:retry|retries|retried|return|returns|returned|serve|served|start|starts|started|stop|stops|stopped|run|runs|sent|send|respond|responds)\s+$/iu.test(before);
    const programming = /\b(?:code|program(?:ming|s)?|javascript|python|call(?:s|ed|ing)?|return(?:s|ed)?|arguments?|parameters?|variables?|scopes?|objects?|methods?|literals?|values?|notebooks?|cells?|statements?|exceptions?|integers?|class(?:es)?|keywords?|positional|data|headers?|content|payload|callbacks?|inputs?|outputs?|throws?|retries|retry|promises?|concurren(?:cy|t|tly)|executions?|milliseconds?|iterables?|mappers?)\b|\uFFFC/iu.test(context);
    if (word === 'attempt') return /^\s+(?:number|count|limit)\b/iu.test(after)
        || /\b(?:the|an|this|that|each|every|first|second|last|next)\s+$/iu.test(before);
    if (word === 'function' || word === 'parameters') return programming
        || word === 'function' && /\(\s*$/u.test(before) && /^\s*[,)]/u.test(after);
    if (word === 'option' || word === 'minimum' || word === 'maximum') return programming;
    if (word === 'forward') return /\blook(?:s|ed|ing)?\s+$/iu.test(before) && /^\s+to\b/iu.test(after)
        || /\b(?:client|server|error|request|packet|message|port|traffic)\b/iu.test(context);
    if (word === 'request') return /\b(?:HTTP|header|body|response|status|URL|client|server|browser|resource|payload|method|GET|POST)\b/iu.test(context)
        || /\b(?:the|a|an|this|that|each|every|your|our|their)\s+$/iu.test(before);
    if (word === 'type') return programming;
    if (word === 'address') return /\b(?:postal|email|mailing|street|home|billing|shipping|IP|network|web|name(?:,| and)?|your|my|their|the|an)\s+$/iu.test(before)
        || /^\s+(?:is|was|will|can|should|has|must)\b/iu.test(after);
    // Referential “it” is not an empty introduction. Keep the explicit
    // evaluative forms (“it is important to”) available for contextual review.
    return /\b(?:if|when|while|although|because|unless|whether)\s+$/iu.test(before)
        || /^\s+(?:a|an|the|called|defined|used|described|written|stored|returned|assigned|printed)\b/iu.test(after);
}

function passiveSubject(before) {
    return before.replace(/\([^()]{0,200}\)\s*/gu, ' ')
        .replace(/\s+(?:(?:am|is|are|was|were|be|been|being|will|can|cannot|could|may|might|must|should|would|has|have|had|not|already|also|still)\s+)+$/iu, ' ');
}

function passiveActor(after) {
    // Keep explicit actors even after a time or location. A deadline or an
    // implementation mechanism does not identify an actor.
    return [...after.matchAll(/\bby\s+([^\s,;]+)/giu)].some(([, word]) =>
        !/^(?:wrapping|combining|calling|setting|passing|returning|using|noon|midnight|dawn|dusk|today|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}(?::\d{2})?(?:am|pm)?)$/iu.test(word));
}

function technicalPassive(actual, before, after) {
    if (!/^(?:(?:am|is|are|was|were|be|been|being)\s+)?(?:called|invoked|enabled|disabled|fulfilled|rejected|aborted|retried|returned|thrown|iterated|limited|skipped|exhausted|specified|mounted|discarded|provided|recommended|expected|done|sent|served|searched|added|determined|treated|designed|desired|used|reached|allowed)$/u.test(actual)) return false;
    const left = before.split(/[.!?;]/u).at(-1), right = after.split(/[.!?;]/u)[0];
    const subject = passiveSubject(left), participle = actual.split(' ').at(-1);
    if (/\b(?:functions?|callbacks?|methods?|mappers?|promises?|retries|retry|errors?|iterables?|middleware|backoff|installation)\s+(?:(?:that|which)\s+)?$/iu.test(subject)) return true;
    if (/\bcalls\s+to\s+\uFFFC+\s*$/iu.test(subject)) return true;
    if (participle === 'expected' && /^\s*(?:receives|accepts|takes)\b[^.!?;]{0,180}\b(?:arguments?|parameters?|inputs?|values?)\b[^.!?;]*\band\s*$/iu.test(subject)
        && /^\s+to\s+(?:return|yield|resolve)\b/iu.test(right)) return true;
    if (participle === 'treated' && /^\s*(?:set|choose|configure|specify)\s+how\s+[^.!?;]{0,80}$/iu.test(subject)
        && /^\s+when\s+encountered\b/iu.test(right)) return true;
    if (['served', 'returned', 'used'].includes(participle)
        && /\b(?:first|next|last)\s+(?:one\s+)?that\s+(?:exists|is\s+found)\s*$/iu.test(subject)) return true;
    const programming = /\b(?:functions?|callbacks?|mappers?|promises?|retry|retries|errors?|iterables?|middleware|headers?|caching|cache|arguments?|parameters?|browsers?|files?|dotfiles?|directories|directory|paths?|milliseconds?|concurrency|executions?)\b/iu.test(left + ' ' + right);
    if (!programming) return false;
    return /(?:\b(?:requests?|responses?|headers?|parameters?|arguments?|values?|options?|files?(?:\s+to\s+serve)?|paths?|extensions?|results|operations?|installation|checks?|limits?|queue|rejection|this)|\uFFFC+)\s+(?:(?:that|which)\s+)?$/iu.test(subject);
}

function descriptivePassive(actual, before, after) {
    const match = actual.match(/^(?:(?:am|is|are|was|were|be|been|being)\s+){0,2}([a-z]+)$/u);
    if (!match) return false;
    const verb = match[1], subject = passiveSubject(before);
    if (/^(?:checked|replaced|measured|cleaned|repaired|inspected|calibrated|serviced|updated|installed|tested|closed|opened)$/u.test(verb)
        && /^\s+(?:(?:once|twice|again|\d+\s+times)\s+)?(?:today|yesterday|tomorrow|overnight|last\s+(?:night|week|month|year)|(?:at|before|after|until|by)\s+(?:\d{1,2}(?::\d{2})?(?:\s*[ap]m)?|noon|midnight|dawn|dusk|breakfast|lunch|dinner)|on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/iu.test(after)) return true;
    if (verb === 'flattened' && /\b(?:grass|soil|ground|paths?|roads?)\s*$/iu.test(subject)
        && /^\s+(?:beneath|under|beside|behind|across|against)\b/iu.test(after)) return true;
    if (/^(?:repaired|replaced|cleaned|painted)$/u.test(verb)
        && /\b(?:gates?|doors?|fences?|roofs?|windows?|floors?|walls?|batteries|battery|cables?)\s*$/iu.test(subject)
        && /\b(?:had|has|have)\s+(?:(?:already|just|recently)\s+)?been\b/iu.test(before + actual)) return true;
    if (verb === 'thrown' && /^\s+away\b/iu.test(after)
        && /\b(?:cables?|batteries|battery|containers?|packaging)\s*$/iu.test(subject)) return true;
    if (verb === 'reserved' && /\b(?:morning|afternoon|evening|time|session|hour|slot|day)\s*$/iu.test(subject)
        && /^\s+for\b/iu.test(after)) return true;
    if (/^(?:printed|displayed|listed|described)$/u.test(verb)
        && /^\s+(?:on|in)\s+(?:the|a|an|this|that)\s+(?:[\p{L}’-]+\s+){0,3}(?:card|label|page|guide|manual|notice|form|sheet|table)\b/iu.test(after)) return true;
    if (/^(?:welcomed|admitted|served)$/u.test(verb)
        && /^\s+(?:at|in)\s+(?:either|any|the|a|an)\s+(?:(?:front|side|main)\s+)?(?:entrance|gate|desk|counter)\b/iu.test(after)) return true;
    if (verb === 'given' && /^\s+(?:a|an|the|your)\s+(?:(?:new|different|alternative|replacement|printed)\s+)?(?:route|map|ticket|pass|receipt|form|number)\b/iu.test(after)
        && /\b(?:at|from)\s+(?:the|a|any)\s+(?:desk|counter|entrance|gate)\b/iu.test(after)) return true;
    // Possessive-gerund subjects describe reactions to an event. Do not treat
    // a sentence/paragraph break or an infinitive continuation as that reaction.
    if (/\b(?:my|your|his|her|its|our|their)\s+(?:not\s+)?going\s+to\s*$/iu.test(subject)
        && /^\s+(?:(?:already|immediately|later|soon)\s+){0,2}(?:(?:surprised|worried|pleased|upset|reassured)\b|(?:was|were|seemed|appeared)\s+(?:unexpected|reasonable|surprising|unlikely|inevitable|(?:(?:my|our|their|his|her)\s+(?:first\s+)?assumption))\b)/iu.test(after)) return true;
    return /^(?:expected|anticipated)$/u.test(verb)
        && /\b(?:my|your|his|her|its|our|their)\s+(?:going|coming|waiting|leaving|returning|arriving|staying|running)(?:\s+(?:home|early|late|today|tomorrow|quietly|outside)){0,3}\s*$/iu.test(subject);
}

function meaningfulExistence(actual, after) {
    if (!/^there (?:is|are)$/iu.test(actual)) return false;
    if (/^\s+no\s+(?:reason|need)\b/iu.test(after)) return true;
    if (/^\s+(?:(?:still|never|not|always)\s+)?(?:(?:enough|too\s+much|no|little|plenty\s+of|some)\s+)?(?:time|room|space|backpressure)\b/iu.test(after)) return true;
    return /^\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|several)\s+(?:[\p{L}’-]+\s+){0,2}(?:jugs?|bottles?|boxes|box|chairs?|tables?|books?|shelves|shelf|seats?|cups?|bags?|tools?|visitors?|people)\s+(?:on|in|at|beside|behind|under|near)\s+(?:the|a|an|this|that|each)\b/iu.test(after);
}

function meaningfulModifier(actual, before, after) {
    if (actual === 'usually') return true;
    if (actual === 'completely') return /^\s+(?:dark|empty|full|dry|wet|silent|closed|open|submerged|covered)\b/iu.test(after);
    if (actual === 'urgently') return /\b(?:need|needs|needed|require|requires|required|request|requested|apply|applied)(?:\s+[\p{L}'’-]+){0,5}\s+$/iu.test(before);
    if (actual === 'deliberately') return /^\s+(?:short|incorrect|wrong|false|blank|empty|omitted|excluded|left)\b/iu.test(after);
    if (actual === 'slowly') return /\b(?:work|works|worked|walk|walks|walked|move|moves|moved|drive|drives|drove|read|reads|stir|stirs|stirred)\s+$/iu.test(before);
    if (actual === 'neatly') return /^\s+(?:mended|folded|stacked|written|arranged|labelled|labeled|packed)\b/iu.test(after);
    if (actual === 'quietly') return /\b(?:wait|waited|waiting|speak|speaking|spoke|work|working|worked|sit|sitting|sat)\s+$/iu.test(before);
    return actual === 'strictly' && /^\s+(?:(?:a|an)\s+)?(?:single|one|limited|less|greater|positive|negative)\b/iu.test(after);
}

export function writingAdvisoryContext(kind, raw, projection) {
    if (kind === 'style.wordiness') return writingWordinessContext(raw, projection);
    if (!['syntax.passive', 'syntax.indirect-opening', 'style.modifier', 'style.stock-phrase', 'formulaic.generalization'].includes(kind)) return false;
    const actual = raw.actual?.toLowerCase() || '', { before, after } = contextAt(raw, projection, kind === 'syntax.passive' ? 256 : 160);
    if (kind === 'syntax.indirect-opening') return meaningfulExistence(actual, after);
    if (kind === 'style.modifier') return meaningfulModifier(actual, before, after);
    if (kind === 'formulaic.generalization') {
        // A reported past scene is not a timeless claim about everyone.
        return /^(?:nobody|no one|everyone|everybody)\s+(?:seemed|appeared)\s+to\s+(?:know|understand|notice|remember)\b/u.test(actual);
    }
    if (kind === 'syntax.passive') {
        const left = before.split(/[.!?;]/u).at(-1), right = after.split(/[.!?;]/u)[0];
        if (passiveActor(right)) return false;
        if (descriptivePassive(actual, left, right)) return true;
        if (technicalPassive(actual, before, after)) return true;
        if (/\bunexpected$/u.test(actual)) return true;
        // An emotional state without an expressed agent is not useful actor advice.
        return /\b(?:disappointed|tired)$/u.test(actual) && !/^\s+by\b/iu.test(after)
            || /\bexposed$/u.test(actual) && /^\s+to\s+(?:(?:cold|strong|hot|harsh|direct)\s+)?(?:winds?|sun(?:light)?|rain|weather|heat|cold)\b/iu.test(after);
    }
    if (actual === 'for the birds') return /\b(?:food|meal|seed|seeds|shelter|water|nest|nests)\s+$/iu.test(before);
    return kind === 'style.stock-phrase' && actual === 'at the end of the day'
        && /^\s*,?\s*(?:ask|clean|close|collect|empty|record|return|switch|turn|write)\b/iu.test(after);
}

// Difficulty words assume the reader's experience only when the sentence
// addresses or instructs the reader; describing a thing as simple does not.
// Knowledge words (obviously, of course, everyone knows) assume in any sentence.
const difficultyWords = new Set(['easy', 'easily', 'simple', 'simply', 'just', 'basically', 'straightforward', 'straight-forward', 'straight forward']);
const instructionVerb = /^(?:add|apply|call|change|check|choose|click|configure|consider|copy|create|delete|download|drag|edit|enable|enter|follow|go|import|install|move|open|paste|press|remove|rename|replace|restart|run|save|select|set|start|switch|tap|try|turn|type|update|use|write)\b/iu;
const leadingAdverbs = /^(?:(?:then|now|first|next|finally|simply|just|basically|and)\s*,?\s+)+/iu;

function readerDirected(before, actual, after) {
    const start = before.split(/(?<=[.!?:;])\s+|\n/u).at(-1);
    const sentence = `${start}${actual}${after.split(/(?<=[.!?])\s|\n/u)[0]}`;
    if (/\b(?:you(?:r|rs|rself|rselves)?|let['’]s)\b/iu.test(sentence)) return true;
    return instructionVerb.test(sentence.trimStart().replace(leadingAdverbs, ''));
}

export function writingInclusiveContext(raw, projection) {
    const word = raw.actual.toLowerCase(), { before, after } = contextAt(raw, projection);
    const tone = ['easy', 'easily', 'simple', 'simply', 'just', 'obvious', 'obviously', 'clearly', 'basically', 'straightforward', 'straight-forward', 'straight forward', 'of course', 'everyone knows'];
    // A capitalized tone word after the sentence start belongs to a title.
    if (tone.includes(word) && /^\p{Lu}/u.test(raw.actual) && /[\p{L}\p{N},]\s+$/u.test(before)) return { skip: true };
    if (difficultyWords.has(word) && !readerDirected(before, raw.actual, after)) return { skip: true };
    if (word === 'easy' && /^[ -]+read\b/iu.test(after)) return { skip: true };
    if (['easy', 'easily', 'simple', 'simply', 'obvious', 'obviously', 'straightforward'].includes(word)
        && /\b(?:not|never|hardly|cannot|can['’]t|isn['’]t|aren['’]t|wasn['’]t|weren['’]t)(?:\s+(?:be|so|very|always|necessarily|particularly|that)){0,3}\s+$/iu.test(before)) return { skip: true };
    if (word === 'just' && /\bnot\s+$/iu.test(before)) return { skip: true };
    if (word === 'just' && /^\s+(?:as|like)\b/iu.test(after)) return { skip: true };
    if (word === 'just' && /^\s+(?:before|after|yesterday|today|now|then|recently)\b/iu.test(after)) return { skip: true };
    if (word === 'just' && /\bas\s+$/iu.test(before)
        && /^\s+(?:unhandled|ordinary|standard|regular)\s+(?:requests?|responses?|events?|errors?)\b/iu.test(after)) return { skip: true };
    if (word === 'easy' && (/^\s+to\s+(?:miss|overlook|forget)\b/iu.test(after)
        || /^\s+(?:route|path|trail)\b/iu.test(after) && /\b(?:sign|map|guide|notice)\b/iu.test(before))) return { skip: true };
    if (word === 'simply' && /\bbeyond\s+$/iu.test(before)) return { skip: true };
    if (word === 'clearly' && /^\s+(?:annotated|labelled|labeled|documented|marked|defined|visible|stated|explained)\b/iu.test(after)) return { skip: true };
    return tone.includes(word) ? { note: 'This wording can assume that readers find a task easy or already know the answer. Describe the steps or prerequisites when useful; keep factual descriptions of difficulty or clarity.', adviceType: 'reader-assumption' } : {};
}
