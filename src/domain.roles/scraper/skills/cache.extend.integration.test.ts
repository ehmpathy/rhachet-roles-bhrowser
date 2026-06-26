import { given, then, useBeforeAll, useThen, when } from 'test-fns';

import { readFileSync } from 'node:fs';
import {
  asStableSnapshot,
  cleanupCacheDir,
  createCacheFile,
  hashEmail,
  setupCacheDir,
  skillFull,
  skillNoThrow,
} from './.test/infra/cache';

describe('cache.extend', () => {
  given('[case1] cache files exist for account', () => {
    const email = 'test@example.com';
    const emailHash = hashEmail(email);
    // .note = expiration in the past, so extend will set to now + duration
    const originalExpires = Date.now() - 3600000; // 1h ago (expired)

    const scene = useBeforeAll(async () => {
      const cacheDir = setupCacheDir();
      const file1 = createCacheFile(
        cacheDir,
        'getProfile',
        emailHash,
        'abc123',
        {
          data: { name: 'Test User' },
          expiresAtMse: originalExpires,
        },
      );
      const file2 = createCacheFile(
        cacheDir,
        'getSubscriptions',
        emailHash,
        'def456',
        {
          data: { active: true },
          expiresAtMse: originalExpires,
        },
      );
      return { cacheDir, file1, file2 };
    });

    afterAll(() => cleanupCacheDir(scene.cacheDir));

    when('[t0] cache.extend is called with --by PT24H', () => {
      const result = useThen('it succeeds', () =>
        skillFull(
          `cache.extend --for ${email} --by PT24H --cache-dir ${scene.cacheDir}`,
        ),
      );

      then('output shows lizard vibes header', () => {
        expect(result.stdout).toContain('toasty');
      });

      then('output shows account info', () => {
        expect(result.stdout).toContain(`account: ${email}`);
        expect(result.stdout).toContain(`hash: ${emailHash}`);
      });

      then('output shows duration', () => {
        expect(result.stdout).toContain('PT24H');
        expect(result.stdout).toContain('+86400000ms');
      });

      then('output shows files count', () => {
        expect(result.stdout).toContain('files: 2');
      });

      then('cache file expiresAtMse is extended', () => {
        const content1 = JSON.parse(readFileSync(scene.file1, 'utf-8'));
        const content2 = JSON.parse(readFileSync(scene.file2, 'utf-8'));

        // .note = idempotent: sets to now + duration, not originalExpires + duration
        // should be approximately now + 24h (within 5s tolerance for test execution time)
        const now = Date.now();
        const tolerance = 5000;
        expect(content1.expiresAtMse).toBeGreaterThan(
          now + 86400000 - tolerance,
        );
        expect(content1.expiresAtMse).toBeLessThan(now + 86400000 + tolerance);
        expect(content2.expiresAtMse).toBeGreaterThan(
          now + 86400000 - tolerance,
        );
        expect(content2.expiresAtMse).toBeLessThan(now + 86400000 + tolerance);
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.stdout)).toMatchSnapshot();
      });
    });
  });

  given('[case2] duration is PT1H', () => {
    const email = 'hourly@example.com';
    const emailHash = hashEmail(email);
    // .note = expiration in the past, so extend will set to now + duration
    const originalExpires = Date.now() - 1800000; // 30m ago (expired)

    const scene = useBeforeAll(async () => {
      const cacheDir = setupCacheDir();
      const file = createCacheFile(cacheDir, 'getData', emailHash, 'abc123', {
        data: {},
        expiresAtMse: originalExpires,
      });
      return { cacheDir, file };
    });

    afterAll(() => cleanupCacheDir(scene.cacheDir));

    when('[t0] cache.extend is called with --by PT1H', () => {
      useThen('it succeeds', () =>
        skillFull(
          `cache.extend --for ${email} --by PT1H --cache-dir ${scene.cacheDir}`,
        ),
      );

      then('cache file expiresAtMse is extended by 1 hour', () => {
        const content = JSON.parse(readFileSync(scene.file, 'utf-8'));
        // .note = idempotent: sets to now + duration
        const now = Date.now();
        const tolerance = 5000;
        expect(content.expiresAtMse).toBeGreaterThan(now + 3600000 - tolerance);
        expect(content.expiresAtMse).toBeLessThan(now + 3600000 + tolerance);
      });
    });
  });

  given('[case3] duration is PT30M', () => {
    const email = 'halfhour@example.com';
    const emailHash = hashEmail(email);
    // .note = expiration in the past, so extend will set to now + duration
    const originalExpires = Date.now() - 900000; // 15m ago (expired)

    const scene = useBeforeAll(async () => {
      const cacheDir = setupCacheDir();
      const file = createCacheFile(cacheDir, 'getData', emailHash, 'abc123', {
        data: {},
        expiresAtMse: originalExpires,
      });
      return { cacheDir, file };
    });

    afterAll(() => cleanupCacheDir(scene.cacheDir));

    when('[t0] cache.extend is called with --by PT30M', () => {
      useThen('it succeeds', () =>
        skillFull(
          `cache.extend --for ${email} --by PT30M --cache-dir ${scene.cacheDir}`,
        ),
      );

      then('cache file expiresAtMse is extended by 30 minutes', () => {
        const content = JSON.parse(readFileSync(scene.file, 'utf-8'));
        // .note = idempotent: sets to now + duration
        const now = Date.now();
        const tolerance = 5000;
        expect(content.expiresAtMse).toBeGreaterThan(now + 1800000 - tolerance);
        expect(content.expiresAtMse).toBeLessThan(now + 1800000 + tolerance);
      });
    });
  });

  given('[case4] no cache files exist for account', () => {
    const email = 'nobody@example.com';

    const scene = useBeforeAll(async () => {
      const cacheDir = setupCacheDir();
      return { cacheDir };
    });

    afterAll(() => cleanupCacheDir(scene.cacheDir));

    when('[t0] cache.extend is called', () => {
      const result = useThen('it succeeds', () =>
        skillFull(
          `cache.extend --for ${email} --by PT1H --cache-dir ${scene.cacheDir}`,
        ),
      );

      then('output shows cold snap', () => {
        expect(result.stdout).toContain('cold snap');
      });

      then('output shows zero files', () => {
        expect(result.stdout).toContain('files: 0');
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.stdout)).toMatchSnapshot();
      });
    });
  });

  given('[case5] --for is not provided', () => {
    const scene = useBeforeAll(async () => {
      const cacheDir = setupCacheDir();
      return { cacheDir };
    });

    afterAll(() => cleanupCacheDir(scene.cacheDir));

    when('[t0] cache.extend is called without --for', () => {
      const result = useThen('it fails with exit code 2', () =>
        skillNoThrow(`cache.extend --by PT1H --cache-dir ${scene.cacheDir}`),
      );

      then('exit code is 2 (constraint error)', () => {
        expect(result.exitCode).toBe(2);
      });

      then('stderr shows error message', () => {
        expect(result.stderr).toContain('--for required');
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.stderr)).toMatchSnapshot();
      });
    });
  });

  given('[case6] --by is not provided', () => {
    const scene = useBeforeAll(async () => {
      const cacheDir = setupCacheDir();
      return { cacheDir };
    });

    afterAll(() => cleanupCacheDir(scene.cacheDir));

    when('[t0] cache.extend is called without --by', () => {
      const result = useThen('it fails with exit code 2', () =>
        skillNoThrow(
          `cache.extend --for test@example.com --cache-dir ${scene.cacheDir}`,
        ),
      );

      then('exit code is 2 (constraint error)', () => {
        expect(result.exitCode).toBe(2);
      });

      then('stderr shows error message', () => {
        expect(result.stderr).toContain('--by required');
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.stderr)).toMatchSnapshot();
      });
    });
  });

  given('[case7] --cache-dir is not provided', () => {
    when('[t0] cache.extend is called without --cache-dir', () => {
      const result = useThen('it fails with exit code 2', () =>
        skillNoThrow(`cache.extend --for test@example.com --by PT1H`),
      );

      then('exit code is 2 (constraint error)', () => {
        expect(result.exitCode).toBe(2);
      });

      then('stderr shows error message', () => {
        expect(result.stderr).toContain('--cache-dir required');
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.stderr)).toMatchSnapshot();
      });
    });
  });

  given('[case8] cache file without expiresAtMse', () => {
    const email = 'noexpiry@example.com';
    const emailHash = hashEmail(email);

    const scene = useBeforeAll(async () => {
      const cacheDir = setupCacheDir();
      createCacheFile(cacheDir, 'getData', emailHash, 'abc123', {
        data: { foo: 'bar' },
        // no expiresAtMse
      });
      return { cacheDir };
    });

    afterAll(() => cleanupCacheDir(scene.cacheDir));

    when('[t0] cache.extend is called', () => {
      const result = useThen('it succeeds', () =>
        skillFull(
          `cache.extend --for ${email} --by PT1H --cache-dir ${scene.cacheDir}`,
        ),
      );

      then('output shows file was skipped', () => {
        expect(result.stdout).toContain('skipped: no expiresAtMse');
      });
    });
  });

  given('[case9] invalid duration format', () => {
    const scene = useBeforeAll(async () => {
      const cacheDir = setupCacheDir();
      return { cacheDir };
    });

    afterAll(() => cleanupCacheDir(scene.cacheDir));

    when('[t0] cache.extend is called with invalid duration', () => {
      const result = useThen('it fails with exit code 2', () =>
        skillNoThrow(
          `cache.extend --for test@example.com --by invalid --cache-dir ${scene.cacheDir}`,
        ),
      );

      then('exit code is 2 (constraint error)', () => {
        expect(result.exitCode).toBe(2);
      });

      then('stderr shows error message', () => {
        expect(result.stderr).toContain('invalid duration format');
      });

      then('output matches snapshot', () => {
        expect(asStableSnapshot(result.stderr)).toMatchSnapshot();
      });
    });
  });

  given('[case10] --help', () => {
    when('[t0] cache.extend is called with --help', () => {
      const result = useThen('shows help', () =>
        skillNoThrow('cache.extend --help'),
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
