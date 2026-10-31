@AGENTS.md

## Memory budget (shared machine)

Several agents run at once on 30 GB of RAM with no swap, and `/tmp` is RAM
(tmpfs). One greedy agent gets Claude Desktop OOM-killed and every session
loses its work. Keep a light footprint:

- **Scratch files are RAM.** Your scratchpad lives under `/tmp`. Don't put
  binaries, repo copies, tarballs, PDFs, audio or piles of screenshots there.
  Anything over ~10 MB goes in `~/.cache/agent-scratch/<task>/` (disk), and
  you delete it when you're done.
- **Never copy or tar the repo** to compare versions. Use `git diff`,
  `git show rev:path`, or one `git worktree add` on disk, and remove it after.
- **One build, reused.** Build each binary to one fixed path and overwrite it;
  don't keep a copy per experiment. Delete it when you're finished.
- **One heavy process at a time:** a game/demo run, a headless browser,
  a full test suite or a build. Cap parallelism (`go test -p 2`,
  `GOMAXPROCS=4`, `--workers=2`), and don't start more than 2 subagents at once.
- **Clean up processes.** Stop dev servers, headless Chrome/Playwright and
  background runs as soon as you have the result. Never leave them running.
- **Screenshots:** keep only the ones you'll show the user; delete the rest.
- **Check first:** before anything heavy, run `free -g`. If `available` is
  under 4 GB, wait for it to recover or ask the user.
- **Clean up when you finish.** Before you report a task done, delete
  everything you created outside the repo: your scratchpad contents,
  `~/.cache/agent-scratch/<task>/`, temp dirs under `/tmp`, extra git
  worktrees, test binaries and screenshots you won't show. Stop every
  background process you started (dev servers, browsers, `tail -f`,
  watchers). Leftovers in `/tmp` stay in RAM until someone deletes them.
  Delete only your own `<task>` folder: never `~/.cache/agent-scratch` itself
  or another task's folder (other sessions are using them; on 2026-10-29 an
  `rm -rf ~/.cache/agent-scratch` wiped several sessions' work). Name the folder
  `<project>-<task>` so it can't clash with another session's.
