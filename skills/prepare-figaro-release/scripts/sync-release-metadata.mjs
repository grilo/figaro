#!/usr/bin/env node

import releaseMetadata from './releaseMetadata.cjs';

releaseMetadata.main(process.argv.slice(2));
