# Notes and planning

[All guides](README.md) · [Getting started](GETTING_STARTED.md) · [Writing](WRITING.md)

## Capture and connect

Use **Quick note** or **Ctrl/Cmd+N** to create a timestamped note in `Inbox`.
The Today dashboard opens when no file tab is active. It offers a daily note,
quick capture, due tasks, recent notes, and older material to revisit. Daily
notes use `Inbox/YYYY-MM-DD.md`; existing daily notes at the vault root still open.

Search by title or content. While writing a link, completion suggests existing
notes or offers **Create note**. **Settings → Links** chooses Markdown links or
wiki links. Backlinks show incoming references and unlinked mentions that you
can turn into links. Graph explores the connections between notes.

A conventional Markdown link can target a note or a heading within one.
Ctrl/Cmd-click an external HTTP or HTTPS link to open it in your default browser.
A bare `[label]` is ordinary text unless a matching reference definition exists.

When creating or renaming a note with a similar name, Figaro offers the existing
note first. It does not merge them automatically. Missing links offer a similar
choice: use an existing note or create the requested target.

## Organize the file tree

Use F2 to rename, Delete for the recovery-aware deletion confirmation, and
Ctrl/Cmd+X, C, or V to cut, copy, and paste. Ctrl/Cmd-click or keyboard Space
selects multiple internal files and folders. Escape cancels a pending cut.

When renaming a referenced note, Figaro asks what to do with incoming Markdown
links. Update them, keep their authored destinations, or cancel. Folder moves
preserve links. **Merge Notes** needs at least two Markdown notes selected in
the tree. Copying and importing preserve existing files when names collide.

**Settings → Vault care** offers checks for similar notes and repeated
filenames. Its **Recently deleted** list restores archived items without
replacing new content at the same path. See [recovery](GETTING_STARTED.md#save-history-and-recovery).

## Put tasks on a board

Kanban cards come from Markdown lines with standalone hashtags. A checkbox is
optional:

```markdown
- [ ] Draft the invitation #todo
- [ ] Book the reading room #doing
- [x] Talk to the library team #done
```

Open **Kanban** from the sidebar or click a hashtag in a note. Drag a card to
another column, or use its keyboard controls:

| Key | Action on a focused card |
| --- | --- |
| Up / Down | Change its position in the column |
| Left / Right | Move it to an adjacent column |
| Enter | Open the source note |
| S / D | Set its start / due date |
| Delete | Remove its column tag |
| Shift+F10 / Menu | Open card actions |

The start and due pills open the date picker. The card menu can clear dates or
remove the card from the board. Removing a column tag leaves the task text.

## Add dates and schedules

Type `@date` and accept the completion with Enter, Tab, or Space to open a
calendar. Choosing a date inserts a link using your preferred link style. On a
task, it also stores a deadline; an untagged checklist item joins `#todo`.
The checklist's Calendar action uses the same flow.

Figaro replaces a single date on the line. With no dates or more than one, it
adds the new date. Cancel changes nothing. Clearing a deadline leaves authored date
links in the note. `@today`, `@tomorrow`, and `@yesterday` also insert date links.
Open the help button (**?**) and choose **Macros** to see these shortcuts.

Task schedules live in `.config/task-schedules.json`. Save dirty notes before
scheduling them. Dates follow unique task text when lines shift or tags change,
and follow file moves inside Figaro. Renamed or ambiguous tasks appear under
**Reconnect**. Choose the intended task there; it cannot overwrite another
schedule. Old `[due …]` links do not schedule tasks on their own.

## Calendar and Gantt

**Calendar** shows note activity and scheduled tasks. Select a day to see its
notes and deadlines. Switch from **Month** to **Timeline** to browse a wider
range. The week layout follows your system locale. Reminders remain inside
Figaro; they do not use operating-system notifications.

In **Kanban**, switch from **Board** to **Gantt** for a timeline of the same
tasks. Choose start and end dates, drag a bar to move its range, or drag an end
to resize it. Escape cancels a drag. **End** is the due date used throughout the
app. **Unscheduled** clears both dates; **Open note** returns to the task.

Moving a task out of TODO for the first time sets its start date. Later moves
preserve that start and any overdue deadline. End-only tasks show a one-day
bar; start-only tasks extend through today. Use the week arrows, scrolling,
panning, or **Today** to navigate.

Clicking the active Calendar, Kanban, or Graph control returns to your previous
view. Clicking Timeline again returns to Month; clicking Gantt again returns
to Board. Returning to a document restores its previous details pane.

## Keep a running meeting note

Keep adding meetings at the top of a project note. Optional [activity dates](WRITING.md#see-when-a-passage-changed)
show when passages were recorded without inserting date text. A planned meeting
still needs an authored date such as `@tomorrow`: Calendar follows those
explicit links and task dates, not the activity margin.
