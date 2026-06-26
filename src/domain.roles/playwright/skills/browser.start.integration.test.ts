import * as fs from 'fs';
import { given, then, when } from 'test-fns';

import {
  asStableSnapshot,
  getWsEndpointFile,
  skillFull,
  skillNoThrow,
  stopBrowser,
} from './.test/infra/browser';

describe('browser.start', () => {
  given('[case1] --mode HEADLESS', () => {
    const session = 'start-case1';
    const wsEndpointFile = getWsEndpointFile(session);

    beforeAll(() => {
      stopBrowser(session);
    });

    afterAll(() => {
      stopBrowser(session);
    });

    when('[t0] skill is invoked', () => {
      then('it starts browser and writes wsEndpoint file', () => {
        const result = skillFull(
          `browser.start --mode HEADLESS --session ${session}`,
        );

        expect(asStableSnapshot(result.stdout)).toMatchSnapshot('stdout');
        expect(asStableSnapshot(result.stderr)).toMatchSnapshot('stderr');

        expect(result.stdout).toContain('🦎 lets get some sun');
        expect(result.stdout).toContain('📽️ browser.start');
        expect(result.stdout).toContain(`session: ${session}`);
        expect(result.stdout).toContain('mode: HEADLESS');
        expect(result.stdout).toContain('wsEndpoint: ws://');
        expect(fs.existsSync(wsEndpointFile)).toBe(true);
      });
    });
  });

  given('[case2] without --mode', () => {
    when('[t0] skill is invoked without --mode', () => {
      then('it fails with usage message', () => {
        const result = skillNoThrow('browser.start');

        expect(result.exitCode).toBeGreaterThan(0);
        expect(asStableSnapshot(result.stdout)).toMatchSnapshot('stdout');
        expect(asStableSnapshot(result.stderr)).toMatchSnapshot('stderr');
        expect(result.stderr).toContain('--mode required');
      });
    });
  });

  given('[case3] with invalid --mode', () => {
    when('[t0] skill is invoked with invalid mode', () => {
      then('it fails with error message', () => {
        const result = skillNoThrow('browser.start --mode INVALID');

        expect(result.exitCode).toBeGreaterThan(0);
        expect(asStableSnapshot(result.stdout)).toMatchSnapshot('stdout');
        expect(asStableSnapshot(result.stderr)).toMatchSnapshot('stderr');
        expect(result.stderr).toContain('invalid mode');
      });
    });
  });

  given('[case4] --refresh kills extant browser', () => {
    const session = 'start-case4';
    const wsEndpointFile = getWsEndpointFile(session);

    beforeAll(() => {
      stopBrowser(session);
    });

    afterAll(() => {
      stopBrowser(session);
    });

    when('[t0] browser is started then refreshed', () => {
      then('new browser replaces old one', () => {
        skillFull(`browser.start --mode HEADLESS --session ${session}`);
        const endpoint1 = fs.readFileSync(wsEndpointFile, 'utf-8');

        const result = skillFull(
          `browser.start --mode HEADLESS --session ${session} --refresh`,
        );

        expect(asStableSnapshot(result.stdout)).toMatchSnapshot(
          '--refresh stdout',
        );
        expect(asStableSnapshot(result.stderr)).toMatchSnapshot(
          '--refresh stderr',
        );

        expect(result.stdout).toContain('🦎 lets get some sun');
        expect(result.stdout).toContain('📽️ browser.start');

        const endpoint2 = fs.readFileSync(wsEndpointFile, 'utf-8');
        expect(endpoint2).not.toEqual(endpoint1);
      });
    });
  });

  given('[case5] --help', () => {
    when('[t0] browser.start is called with --help', () => {
      then('shows help', () => {
        const result = skillNoThrow('browser.start --help');

        expect(result.exitCode).toBe(0);
        expect(asStableSnapshot(result.stdout)).toMatchSnapshot('stdout');
        expect(asStableSnapshot(result.stderr)).toMatchSnapshot('stderr');
        expect(result.combined).toMatch(/usage:/i);
      });
    });
  });
});
