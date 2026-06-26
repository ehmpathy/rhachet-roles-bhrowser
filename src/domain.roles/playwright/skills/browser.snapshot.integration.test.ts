import { given, then, useThen, when } from 'test-fns';

import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import {
  asStableSnapshot,
  CACHE_ROOT,
  rhx,
  skillFull,
  skillNoThrow,
  stopBrowser,
} from './.test/infra/browser';

/**
 * .what = integration tests for browser.snapshot skills
 *
 * .why = verify snapshot dispatcher and all 6 sub-skills work correctly
 */
describe('browser.snapshot', () => {
  const session = 'test-snapshot';

  // start browser once for all tests
  beforeAll(() => {
    stopBrowser(session);
    rhx(`rhx browser.start --session ${session} --mode HEADLESS`);
  });

  afterAll(() => {
    stopBrowser(session);
  });

  given('[case1] browser with default tab', () => {
    when('[t0] browser.snapshot is called with --focused', () => {
      const result = useThen('snapshot dispatcher runs all sub-skills', () =>
        skillFull(`browser.snapshot --session ${session} --focused`),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });

      then('output contains turtle vibe', () => {
        expect(result.stdout).toContain('🦎');
      });

      then('output contains browser.snapshot header', () => {
        expect(result.stdout).toContain('browser.snapshot');
      });

      then('output lists all 6 sub-skills', () => {
        const subSkills = [
          'snapshot.meta.json',
          'snapshot.png',
          'snapshot.html',
          'snapshot.storage.json',
          'snapshot.console.json',
          'snapshot.network.json',
        ];
        for (const sub of subSkills) {
          expect(result.stdout).toContain(sub);
        }
      });

      then('snapshot files are created', () => {
        const snapshotDir = readdirSync(`${CACHE_ROOT}/browser.${session}`);
        const snapshotDirs = snapshotDir.filter((f) =>
          f.startsWith('snapshot.'),
        );
        expect(snapshotDirs.length).toBeGreaterThan(0);

        // find most recent snapshot dir (guard ensures at least one exists)
        const sortedDirs = snapshotDirs.sort();
        const latestDir = sortedDirs[sortedDirs.length - 1];
        const files = readdirSync(
          `${CACHE_ROOT}/browser.${session}/${latestDir}`,
        );
        expect(files).toContain('snapshot.meta.json');
        expect(files).toContain('snapshot.png');
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.stdout)).toMatchSnapshot();
      });
    });
  });

  given('[case2] individual snapshot sub-skills', () => {
    when('[t0] browser.snapshot meta is called', () => {
      const result = useThen('meta snapshot succeeds', () =>
        skillFull(`browser.snapshot meta --session ${session} --focused`),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });

      then('output contains snapshot.meta', () => {
        expect(result.stdout).toContain('snapshot.meta');
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.stdout)).toMatchSnapshot();
      });
    });

    when('[t1] browser.snapshot screen is called', () => {
      const result = useThen('screen snapshot succeeds', () =>
        skillFull(`browser.snapshot screen --session ${session} --focused`),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });

      then('output contains snapshot.png', () => {
        expect(result.stdout).toContain('snapshot.png');
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.stdout)).toMatchSnapshot();
      });
    });

    when('[t2] browser.snapshot html is called', () => {
      const result = useThen('html snapshot succeeds', () =>
        skillFull(`browser.snapshot html --session ${session} --focused`),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });

      then('output contains snapshot.html', () => {
        expect(result.stdout).toContain('snapshot.html');
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.stdout)).toMatchSnapshot();
      });
    });

    when('[t3] browser.snapshot storage is called', () => {
      const result = useThen('storage snapshot succeeds', () =>
        skillFull(`browser.snapshot storage --session ${session} --focused`),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });

      then('output contains snapshot.storage', () => {
        expect(result.stdout).toContain('snapshot.storage');
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.stdout)).toMatchSnapshot();
      });
    });

    when('[t4] browser.snapshot console is called', () => {
      const result = useThen('console snapshot succeeds', () =>
        skillFull(`browser.snapshot console --session ${session} --focused`),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });

      then('output contains snapshot.console', () => {
        expect(result.stdout).toContain('snapshot.console');
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.stdout)).toMatchSnapshot();
      });
    });

    when('[t5] browser.snapshot network is called', () => {
      const result = useThen('network snapshot succeeds', () =>
        skillFull(`browser.snapshot network --session ${session} --focused`),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });

      then('output contains snapshot.network', () => {
        expect(result.stdout).toContain('snapshot.network');
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.stdout)).toMatchSnapshot();
      });
    });
  });

  given('[case3] snapshot with --tab and --url pit-of-success', () => {
    when('[t0] snapshot called with --tab but no --url', () => {
      const result = useThen('returns constraint error', () =>
        skillNoThrow(`browser.snapshot --session ${session} --tab -1`),
      );

      then('exit code is 2 (constraint)', () => {
        expect(result.exitCode).toBe(2);
      });

      then('output indicates --url required', () => {
        expect(result.combined).toMatch(/--url.*required|url.*verification/i);
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.combined)).toMatchSnapshot();
      });
    });

    when('[t1] snapshot called with neither --focused nor --tab', () => {
      const result = useThen('returns constraint error', () =>
        skillNoThrow(`browser.snapshot --session ${session}`),
      );

      then('exit code is 2 (constraint)', () => {
        expect(result.exitCode).toBe(2);
      });

      then('output indicates tab selection required', () => {
        expect(result.combined).toMatch(/--focused|--tab/i);
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.combined)).toMatchSnapshot();
      });
    });

    when('[t2] snapshot called with --tab and valid --url', () => {
      const result = useThen('succeeds with tab+url', () =>
        skillFull(
          `browser.snapshot meta --session ${session} --tab 0 --url 'chrome://new-tab-page/'`,
        ),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.combined)).toMatchSnapshot();
      });
    });

    when('[t3] snapshot called with --tab and mismatched --url', () => {
      const result = useThen('returns constraint error', () =>
        skillNoThrow(
          `browser.snapshot meta --session ${session} --tab 0 --url 'nonexistent.com'`,
        ),
      );

      then('exit code is 2 (constraint)', () => {
        expect(result.exitCode).toBe(2);
      });

      then('output indicates url mismatch', () => {
        expect(result.combined).toMatch(
          /url.*verification.*failed|expected.*but found/i,
        );
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.combined)).toMatchSnapshot();
      });
    });
  });

  given('[case4] snapshot with custom output', () => {
    const outputPath = `${CACHE_ROOT}/custom-output`;

    beforeAll(() => {
      mkdirSync(outputPath, { recursive: true });
    });

    when('[t0] snapshot called with --output', () => {
      const result = useThen('snapshot written to custom path', () =>
        skillFull(
          `browser.snapshot meta --session ${session} --focused --output ${outputPath}`,
        ),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });

      then('file is created at custom path', () => {
        expect(existsSync(`${outputPath}/snapshot.meta.json`)).toBe(true);
      });
    });
  });

  given('[case5] without browser', () => {
    const noSession = 'snapshot-no-browser';

    beforeAll(() => {
      stopBrowser(noSession);
    });

    when('[t0] browser.snapshot is called without active browser', () => {
      const result = useThen('returns constraint error', () =>
        skillNoThrow(`browser.snapshot --session ${noSession} --focused`),
      );

      then('exit code is 2 (constraint)', () => {
        expect(result.exitCode).toBe(2);
      });

      then('output indicates no browser found', () => {
        expect(result.stderr).toMatch(/no browser found/i);
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.stderr)).toMatchSnapshot();
      });
    });
  });

  given('[case6] --help', () => {
    when('[t0] browser.snapshot is called with --help', () => {
      const result = useThen('shows help', () =>
        skillNoThrow('browser.snapshot --help'),
      );

      then('exit code is 0', () => {
        expect(result.exitCode).toBe(0);
      });

      then('output shows usage', () => {
        expect(result.combined).toMatch(/usage:/i);
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.combined)).toMatchSnapshot();
      });
    });
  });
});
