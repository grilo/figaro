#!/usr/bin/env python3
"""Compare complete alert multisets; timings describe this host, not Windows AV."""
import hashlib
import json
import platform
from pathlib import Path
import shutil
import statistics
import subprocess
import sys
import time
from baseline import fetch_baseline

ROOT = Path(__file__).resolve().parents[2]


def canonical(alerts):
    return sorted(json.dumps(alert, sort_keys=True, ensure_ascii=False) for alert in alerts)


def main():
    workspace = Path(sys.argv[1]).resolve()
    samples = json.loads((workspace / 'samples.json').read_text())
    baseline = workspace / 'baseline'
    baseline.mkdir(exist_ok=True)
    binary = fetch_baseline(baseline)
    shutil.copytree(ROOT / 'internal/writing/styles', baseline / 'styles', dirs_exist_ok=True)
    shutil.copyfile(ROOT / 'internal/writing/styles/figaro.ini', baseline / 'figaro.ini')
    # A single embedded process handles all documents and repetitions.
    start = time.perf_counter()
    with (workspace / 'embedded.json').open('w') as output, (workspace / 'embedded.log').open('w') as log:
        subprocess.run([str(workspace / 'embedded'), str(workspace / 'samples.json')], stdout=output, stderr=log, check=True, timeout=600)
    embedded_wall = 1000*(time.perf_counter()-start)
    embedded = json.loads((workspace / 'embedded.json').read_text())
    results = []
    for sample, result in zip(samples, embedded['results'], strict=True):
        durations, alerts, previous, stable = [], [], None, True
        for _ in range(3):
            start = time.perf_counter()
            raw = subprocess.check_output([str(binary), '--config='+str(baseline/'figaro.ini'), '--no-global', '--output=JSON', '--ext=.txt', '--no-exit'], input=sample['source'].encode(), cwd=baseline, timeout=60)
            durations.append(1000*(time.perf_counter()-start))
            alerts = [alert for group in json.loads(raw).values() for alert in group]
            current = canonical(alerts)
            if previous is not None and previous != current:
                stable = False
            previous = current
        expected, actual = canonical(alerts), canonical(result['alerts'])
        matches = expected == actual and not result.get('error') and stable and result['stable']
        item = {'name': sample['name'], 'sourceSHA256': hashlib.sha256(sample['source'].encode()).hexdigest(), 'sourceBytes': len(sample['source'].encode()), 'words': len(sample['source'].split()), 'cliMillis': durations, 'embeddedMillis': result['millis'], 'cliAlerts': len(alerts), 'embeddedAlerts': len(result['alerts']), 'cliStable': stable, 'embeddedStable': result['stable'], 'equal': bool(matches)}
        if not matches:
            item['error'] = result.get('error')
            item['onlyCLI'] = sorted(set(expected)-set(actual))[:5]
            item['onlyEmbedded'] = sorted(set(actual)-set(expected))[:5]
        results.append(item)
        print(f"{sample['name']}: {'MATCH' if matches else 'DIFF'}; CLI {statistics.median(durations):.1f} ms / embedded {statistics.median(result['millis']):.1f} ms", file=sys.stderr)
    report = {'upstream': 'github.com/vale-cli/vale/v3@v3.20.0', 'baselineSHA256': hashlib.sha256(binary.read_bytes()).hexdigest(), 'platform': embedded['platform'], 'go': embedded['go'], 'cpu': platform.processor(), 'embeddedInitMs': embedded['initMs'], 'embeddedTotalWallMs': embedded_wall, 'embeddedHeapAfterGCMiB': embedded['heapAfterGCMiB'], 'results': results, 'allEqual': all(r['equal'] for r in results)}
    (workspace / 'comparison.json').write_text(json.dumps(report, indent=2)+'\n')
    if not report['allEqual']:
        sys.exit(1)


if __name__ == '__main__':
    main()
