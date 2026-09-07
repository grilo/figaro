#!/usr/bin/env bash

# Shared verification for a provisional release and an approved release.
set -euo pipefail
repository_root="$(cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$repository_root"

git diff --check
git diff --cached --check

./scripts/prepare-frontend.sh
npm run lint
npm run test:coverage
go vet . ./internal/... ./cmd/...
./scripts/check-go-coverage.sh
go test -race . ./internal/... ./cmd/...
npx playwright install chromium
browser_pdf_executable="${FIGARO_BROWSER_PDF_EXECUTABLE:-}"
if [ -z "$browser_pdf_executable" ]; then
    browser_pdf_executable="$(node --input-type=module -e \
        "import { chromium } from 'playwright'; process.stdout.write(chromium.executablePath())")"
fi
FIGARO_BROWSER_PDF_EXECUTABLE="$browser_pdf_executable" \
    go test -v ./internal/pdfexport -run '^TestRenderChromiumPDFAgainstOptInBrowser$'
npm run test:pdf

git diff --check
git diff --cached --check
