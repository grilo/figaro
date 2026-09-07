# Getting started

[All guides](README.md) · [Writing](WRITING.md) · [Notes and planning](NOTES_AND_PLANNING.md)

## Install and launch

Download the archive for your platform from
[GitHub Releases](https://github.com/grilo/figaro/releases/latest) and extract it.
Linux builds target x86-64, Windows builds target x86-64, and the macOS archive
supports both Intel and Apple Silicon. Builds are unsigned, so Windows
SmartScreen or macOS Gatekeeper may ask you to confirm the first launch.

Linux needs GTK 3 and WebKitGTK 4.1 or 4.0. PDF generation uses an installed
Chrome, Chromium, Brave, or Edge browser. Linux supports browser commands under
`/snap/bin`; macOS can also use its built-in WebKit engine.

Figaro opens `./vault` relative to its working directory by default. An empty
vault receives a welcome note with examples. A vault is the folder that
holds your notes and supporting files.

Set `VAULT_PATH` before launch to use another folder. For example, from the
directory containing the extracted Linux executable:

```sh
VAULT_PATH="$HOME/Documents/Notes" ./figaro
```

In PowerShell, from the directory containing the Windows executable:

```powershell
$env:VAULT_PATH = "$env:USERPROFILE\Documents\Notes"
.\figaro.exe
```

On macOS, from the directory containing the extracted app:

```sh
VAULT_PATH="$HOME/Documents/Notes" ./figaro.app/Contents/MacOS/figaro
```

Quit the running app before launching with a different `VAULT_PATH`. Figaro
uses one desktop instance and one vault at a time.

## Bring your notes

Copy or drop files and folders into the file tree. Figaro asks before importing,
preserves folder structure, and avoids overwriting existing files.

Opening a Markdown file outside the vault offers two choices:

- **Import** creates a copy in the vault and opens it.
- **Keep outside vault** edits the original through a temporary shortcut. That
  file is excluded from vault search, planning, history, and saved sessions.

Notes remain Markdown files; images, code, and diagrams keep their normal file
formats. Unsupported files can still be organized in the tree and opened in
their default application.

## Make the workspace comfortable

Use **Settings** to choose a theme, fonts, text width, and editor preferences.
Collapse the sidebar with **Ctrl/Cmd+Shift+B** to enter Pure mode. Expand it to
restore the surrounding workspace and any previously open details pane.

The buttons beside the document open Outline, Raw Text Preview, PDF Preview,
or Writing lenses. Drag the pane separator to change its width. Switching
panes keeps that width, and returning to a document restores its previous pane
for the session. Click an active Calendar, Kanban, Graph, or Settings control
again to return to the previous view.

Vault preferences and workspace state live in `.config/` inside the vault and
can be tracked in Git. Machine preferences live in the operating system's application-data directory.
These include window geometry and the selected PDF browser.
Keep the whole vault, including `.config/`, when backing up your workspace.

## Save, history, and recovery

Auto-Save writes notes to disk. Local Git history records versions according to
your Auto-Commit setting; **Save to history** records the active file when it has
changes to save. It does not include unrelated staged files. Undo and Redo belong
to each open document, so switching tabs also switches editing history.

History contains **Versions** for saved notes and **Activity** for passage
changes. Optional margin dates open Activity directly; enable them under
**Settings → Editor → Navigation**. See [passage activity](WRITING.md#see-when-a-passage-changed).

Deleting a vault item bypasses the system Trash. Figaro first saves affected
editors and records the item in local history. If that fails, deletion stops.
Use the status bar's **Undo** immediately after deletion, or open
**Settings → Vault care → Recently deleted** later. Restore refuses to overwrite
an item that now occupies the original path.

If a save fails, keep Figaro open and use **Retry**, **Copy unsaved text**, or
**Keep editing**. The unsaved buffer remains in memory. File warnings in the
tree and status bar explain unreadable files, invalid text, and other problems.
Use their recovery actions, such as **Check again**, to resolve the issue. Files larger
than 50 MB cannot enter the editor.

Local history is useful for recovery. Keep an independent backup too.
