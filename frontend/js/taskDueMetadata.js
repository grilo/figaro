/** A requested deadline is attached only to the exact successfully saved note.
 * The editor owns the one source transaction; the injected normal save flow
 * owns conflict prompts and never force-overwrites an external edit. */
export async function saveTaskDueMetadata({ task, date, content, saveNote, setDue, isCurrent }) {
    const saved = await saveNote(content);
    if (!saved?.success) throw new Error('The note was not saved. Its due date has not changed.');
    if (!isCurrent()) throw new Error('The task changed while saving. Choose its due date again.');
    await setDue(task, date);
}
