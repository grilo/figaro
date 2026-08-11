#!/usr/bin/env node

import releaseNotes from './releaseNotes.cjs';

releaseNotes.main(process.argv.slice(2));
