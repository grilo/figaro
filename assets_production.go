//go:build production

package main

import "embed"

// Wails builds with the production tag. Explicit patterns make a missing
// generated entry point or worker a compile error; all:frontend alone silently
// accepts an unprepared checkout. main.go embeds these same files for serving.
// Keep source-only backend tests independent of frontend build prerequisites.
//
//go:embed frontend/app.bundle.js frontend/writing.worker.js frontend/spelling.worker.js frontend/decisions.worker.js frontend/activity.worker.js
var requiredProductionAssets embed.FS
