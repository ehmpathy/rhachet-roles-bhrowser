import { spawnSync } from 'child_process';
import { dirname } from 'node:path';
import { ConstraintError, MalfunctionError } from 'helpful-errors';

/**
 * .what = shared test utils for browser skill integration tests
 */

// test cache root (isolated from main .cache)
export const CACHE_ROOT = '.temp/.cache';

// skills directory (parent of .test/infra)
export const SKILLS_DIR = dirname(dirname(__dirname));

// clear BROWSER_WS_ENDPOINT so tests use their own session-based endpoints
const env = { CACHE_ROOT, BROWSER_WS_ENDPOINT: '' };

/**
 * .what = get ws endpoint file path for session
 * .why = enables test code to locate browser endpoint for verification
 */
export const getWsEndpointFile = (session: string) =>
  `${CACHE_ROOT}/browser.${session}/ws-endpoint`;

// result of a command execution
export interface RhxResult {
  stdout: string;
  stderr: string;
  combined: string;
  exitCode: number;
}

/**
 * .what = run shell command and return combined output
 * .why = enables test code to invoke skills with isolated cache
 */
export const rhx = (cmd: string): string => {
  const result = rhxFull(cmd);
  return result.combined;
};

/**
 * .what = run shell command and return full result
 * .why = enables test assertions on stdout, stderr, and exit code separately
 */
export const rhxFull = (cmd: string): RhxResult => {
  const result = spawnSync('bash', ['-c', cmd], {
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  });

  // spawn failed - infrastructure malfunction
  if (result.error)
    throw new MalfunctionError('spawn failed', {
      error: result.error.message,
      code: (result.error as NodeJS.ErrnoException).code,
      hint: 'check if bash and required commands are available',
    });

  const exitCode = result.status ?? 1;
  const output: RhxResult = {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    combined: `${result.stdout || ''}${result.stderr || ''}`,
    exitCode,
  };

  // exit 2 = constraint error (caller must fix)
  if (exitCode === 2) {
    throw new ConstraintError('skill constraint not met', {
      command: cmd,
      exitCode,
      stderr: result.stderr,
      stdout: result.stdout,
      hint: 'caller must fix the input or precondition',
    });
  }

  // exit 1 = malfunction (server must fix)
  if (exitCode !== 0) {
    throw new MalfunctionError('skill command failed', {
      command: cmd,
      exitCode,
      stderr: result.stderr,
      stdout: result.stdout,
      hint: 'check stderr for details or run command manually to debug',
    });
  }

  return output;
};

/**
 * .what = run shell command without error on non-zero exit
 * .why = enables test assertions on expected failures
 */
export const rhxNoThrow = (cmd: string): RhxResult => {
  const result = spawnSync('bash', ['-c', cmd], {
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  });

  // spawn failed - infrastructure malfunction
  if (result.error)
    throw new MalfunctionError('spawn failed', {
      error: result.error.message,
      code: (result.error as NodeJS.ErrnoException).code,
      hint: 'check if bash and required commands are available',
    });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    combined: `${result.stdout || ''}${result.stderr || ''}`,
    exitCode: result.status ?? 1,
  };
};

/**
 * .what = stop browser session for test cleanup
 * .note = idempotent: safe to call when browser already stopped
 * .note = throws only on malfunction (exit 1), not on absence
 */
export const stopBrowser = (session = 'default') => {
  const result = rhxNoThrow(`rhx browser.stop --session ${session}`);
  // exit 0 = success (browser stopped or already absent)
  // exit 1 = malfunction (unexpected error)
  // .note = browser.stop never exits 2; it's idempotent by design
  if (result.exitCode === 1) {
    throw new MalfunctionError('stopBrowser failed', {
      session,
      exitCode: result.exitCode,
      stderr: result.stderr,
      hint: 'browser stop encountered unexpected error - check stderr for details',
    });
  }
};

// regex constants for snapshot stabilization
// .decode = ANSI escape codes: ESC[ followed by params and 'm' for color/style
const ANSI_ESCAPE_PATTERN = /\x1b\[[0-9;]*m/g;
// .decode = ws endpoint: ws://localhost:PORT/devtools/browser/UUID
const WS_ENDPOINT_PATTERN = /ws:\/\/localhost:\d+\/devtools\/browser\/[a-f0-9-]+/g;
// .decode = port label: "port: 12345"
const PORT_LABEL_PATTERN = /port: \d+/g;
// .decode = compact ISO timestamp: YYYYMMDDTHHmmssZ
const ISOTIME_PATTERN = /\d{8}T\d{6}Z/g;
// .decode = test cache path prefix
const TEMP_CACHE_PATTERN = /\.temp\/\.cache\//g;
// .decode = snapshot file path with session and timestamp
const SNAPSHOT_PATH_PATTERN = /\.cache\/browser\.([\w-]+)\/snapshot\.[^/\s]+/g;
// .decode = absolute path to repo: /home/user/.../repo-name/
const ABSOLUTE_PATH_PATTERN = /\/home\/[^/]+\/[^\s:]+\//g;

// named transformers for snapshot stabilization
const stripAnsiCodes = (s: string) => s.replace(ANSI_ESCAPE_PATTERN, '');
const redactWsEndpoint = (s: string) =>
  s.replace(WS_ENDPOINT_PATTERN, 'ws://localhost:PORT/devtools/browser/UUID');
const redactPort = (s: string) => s.replace(PORT_LABEL_PATTERN, 'port: PORT');
const redactIsotime = (s: string) => s.replace(ISOTIME_PATTERN, 'ISOTIME');
const normalizeTempCachePath = (s: string) =>
  s.replace(TEMP_CACHE_PATTERN, '.cache/');
const redactSnapshotPath = (s: string) =>
  s.replace(SNAPSHOT_PATH_PATTERN, '.cache/browser.$1/snapshot.ISOTIME.tabN');
const redactAbsolutePath = (s: string) =>
  s.replace(ABSOLUTE_PATH_PATTERN, '$REPO/');

/**
 * .what = redact dynamic values in output for stable snapshots
 * .why = timestamps, ports, UUIDs, paths change between runs
 */
export const asStableSnapshot = (output: string) => {
  const stripped = stripAnsiCodes(output);
  const wsRedacted = redactWsEndpoint(stripped);
  const portRedacted = redactPort(wsRedacted);
  const timeRedacted = redactIsotime(portRedacted);
  const pathNormalized = normalizeTempCachePath(timeRedacted);
  const snapshotRedacted = redactSnapshotPath(pathNormalized);
  const absolutePathRedacted = redactAbsolutePath(snapshotRedacted);
  return absolutePathRedacted;
};

/**
 * .what = run skill shell executable directly (for testing unlinked skills)
 * .why = rhx requires skills to be linked; direct execution allows testing
 */

// run skill executable directly, capture stdout and stderr
export const skill = (cmd: string): string => {
  const result = skillFull(cmd);
  return result.combined;
};

// run skill executable and return full result
export const skillFull = (cmd: string): RhxResult => {
  // transform 'browser.foo ...' to 'bash $SKILLS_DIR/browser.foo.sh ...'
  const execCmd = cmd.replace(
    /^(browser\.\S+)/,
    `bash ${SKILLS_DIR}/$1.sh`,
  );
  const result = spawnSync('bash', ['-c', execCmd], {
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  });

  // spawn failed - infrastructure malfunction
  if (result.error)
    throw new MalfunctionError('spawn failed', {
      error: result.error.message,
      code: (result.error as NodeJS.ErrnoException).code,
      hint: 'check if bash and required commands are available',
    });

  const exitCode = result.status ?? 1;
  const output: RhxResult = {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    combined: `${result.stdout || ''}${result.stderr || ''}`,
    exitCode,
  };

  // exit 2 = constraint error (caller must fix)
  if (exitCode === 2) {
    throw new ConstraintError('skill constraint not met', {
      command: cmd,
      exitCode,
      stderr: result.stderr,
      stdout: result.stdout,
      hint: 'caller must fix the input or precondition',
    });
  }

  // exit 1 = malfunction (server must fix)
  if (exitCode !== 0) {
    throw new MalfunctionError('skill executable failed', {
      command: cmd,
      exitCode,
      stderr: result.stderr,
      stdout: result.stdout,
      hint: 'check stderr for details or run skill directly to debug',
    });
  }

  return output;
};

// run skill executable without error on non-zero exit
export const skillNoThrow = (cmd: string): RhxResult => {
  const execCmd = cmd.replace(
    /^(browser\.\S+)/,
    `bash ${SKILLS_DIR}/$1.sh`,
  );
  const result = spawnSync('bash', ['-c', execCmd], {
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  });

  // spawn failed - infrastructure malfunction
  if (result.error)
    throw new MalfunctionError('spawn failed', {
      error: result.error.message,
      code: (result.error as NodeJS.ErrnoException).code,
      hint: 'check if bash and required commands are available',
    });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    combined: `${result.stdout || ''}${result.stderr || ''}`,
    exitCode: result.status ?? 1,
  };
};
