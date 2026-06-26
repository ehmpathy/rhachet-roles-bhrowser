/**
 * .what = shared utilities for browser operations
 * .why = enables code reuse across operations and import by external code
 */
import * as fs from 'fs';
import { BadRequestError, UnexpectedCodePathError } from 'helpful-errors';
import * as path from 'path';
import { chromium, type Page } from 'playwright';

// type alias: connected browser instance
export type ConnectedBrowser = Awaited<
  ReturnType<typeof chromium.connectOverCDP>
>;

/**
 * .what = get all pages from browser's primary context
 * .why = browsers have multiple contexts; primary context holds user-visible tabs
 * .note = assumes contexts()[0] is primary (user-visible tabs). this assumption holds
 *         for single-context browsers started via browser.start. if additional contexts
 *         are created (incognito, popups), behavior may be incorrect. current skills
 *         do not create additional contexts, so this is safe for the expected use cases.
 */
export const getPagesFromPrimaryContext = (input: {
  browser: ConnectedBrowser;
}): Page[] => input.browser.contexts()[0]?.pages() ?? [];

/**
 * .what = get absolute index for negative tab indices
 * .why = negative indices (e.g., -1 for last tab) are user-friendly but need normalization
 */
export const getAbsoluteTabIndex = (input: {
  tabIndex: number;
  pageCount: number;
}): number =>
  input.tabIndex < 0 ? input.pageCount + input.tabIndex : input.tabIndex;

/**
 * .what = get page at tab index (handles negative indices)
 * .why = unified tab lookup with support for python-style negative index
 */
export const getPageAtTabIndex = (input: {
  pages: Page[];
  tabIndex: number;
}): Page | undefined => {
  const absIndex = getAbsoluteTabIndex({
    tabIndex: input.tabIndex,
    pageCount: input.pages.length,
  });
  return input.pages[absIndex];
};

/**
 * .what = extract first 3 trace lines from stack (filter to "at " lines only)
 * .why = provides concise stack context without excess output; filters out metadata json
 *        that helpful-errors injects into the stack
 */
export const asFirstThreeTraceLines = (input: { stack: string }): string[] => {
  const lines = input.stack.split('\n');
  const traceLines = lines.filter((line) => line.trim().startsWith('at '));
  return traceLines.slice(0, 3);
};

/**
 * .what = format error stack for tree output
 * .why = provides readable indented stack trace for lizard vibes output
 */
export const formatErrorStack = (input: {
  stack: string;
  indent?: string;
}): string => {
  const indent = input.indent ?? '      ';
  const traceLines = asFirstThreeTraceLines({ stack: input.stack });
  return traceLines.join('\n' + indent);
};

/**
 * .what = get constructor name from unknown error
 * .why = isolates optional chain and cast from caller
 */
const asErrorConstructorName = (input: { error: unknown }): string => {
  // .note = cast required: unknown type has no constructor property in TS
  // .why = error classes in JS always have constructor.name; safe access via optional chain
  const maybeError = input.error as { constructor?: { name?: string } };
  return maybeError?.constructor?.name ?? '';
};

/**
 * .what = check if error is an expected HelpfulError type
 * .why = distinguishes known error types for handler vs unexpected throws
 */
export const isExpectedHelpfulErrorType = (input: {
  error: unknown;
}): boolean => {
  const expectedTypes = [
    'BadRequestError',
    'ConstraintError',
    'MalfunctionError',
    'UnexpectedCodePathError',
  ];
  return expectedTypes.includes(asErrorConstructorName({ error: input.error }));
};

/**
 * .what = determine semantic exit code from error type
 * .why = exit 2 = constraint (caller must fix), exit 1 = malfunction (server must fix)
 */
export const determineExitCodeForError = (input: {
  error: unknown;
}): number => {
  // check error class first: BadRequestError = caller must fix = exit 2
  if (input.error instanceof BadRequestError) return 2;

  // fallback: string match for common constraint errors
  const msg = isError(input.error) ? input.error.message.toLowerCase() : '';
  if (msg.includes('connection refused') || msg.includes('connect')) return 2;
  if (msg.includes('enoent') || msg.includes('eacces')) return 2;

  // all other errors are malfunctions = exit 1
  return 1;
};

/**
 * .what = type guard for Error objects
 * .why = enables safe property access without `as` casts
 */
const isError = (value: unknown): value is Error => value instanceof Error;

/**
 * .what = type guard for HelpfulError objects (with metadata and hint)
 * .why = enables safe access to helpful-errors extended properties
 */
const isHelpfulError = (
  value: unknown,
): value is Error & { metadata?: unknown; hint?: string } =>
  isError(value) && ('metadata' in value || 'hint' in value);

/**
 * .what = format error with full context for output
 * .why = combines error message with metadata and hints for observability
 */
export const formatErrorWithContext = (input: { error: unknown }): string => {
  if (!isError(input.error)) return String(input.error);
  const err = input.error;
  // .note = deliberate mutation: collects parts for join; idiomatic array construction
  const parts = [err.message];
  if (isHelpfulError(input.error)) {
    if (input.error.metadata)
      parts.push('context: ' + JSON.stringify(input.error.metadata));
    if (input.error.hint) parts.push('hint: ' + input.error.hint);
  }
  return parts.join(' | ');
};

/**
 * .what = extract clean error message (first line only, without embedded JSON)
 * .why = helpful-errors embeds metadata JSON in message property; we handle metadata separately
 */
const asCleanErrorMessage = (input: { message: string }): string => {
  // take first line only (helpful-errors adds JSON after newline)
  const firstLine = input.message.split('\n')[0] ?? input.message;
  return firstLine.trim();
};

/**
 * .what = format error for tree output
 * .why = provides lizard vibes tree-structured error display
 */
export const formatErrorForTree = (input: { error: unknown }): string => {
  if (!isError(input.error)) {
    return '   └─ error: ' + String(input.error);
  }
  const err = input.error;
  // .note = deliberate mutation: collects parts for join; idiomatic array construction
  const cleanMessage = asCleanErrorMessage({ message: err.message });
  const parts = ['   ├─ error: ' + cleanMessage];
  if (isHelpfulError(input.error)) {
    if (input.error.metadata)
      parts.push('   ├─ context: ' + JSON.stringify(input.error.metadata));
    if (input.error.hint) parts.push('   ├─ hint: ' + input.error.hint);
  }
  if (!err.stack) {
    parts.push('   └─ (no stack trace)');
    return parts.join('\n');
  }
  parts.push('   └─ stack: ' + formatErrorStack({ stack: err.stack }));
  return parts.join('\n');
};

/**
 * .what = safely extract error message from unknown value
 * .why = enables pattern match on error messages without unsafe casts
 */
const getErrorMessage = (input: { error: unknown }): string =>
  isError(input.error) ? input.error.message.toLowerCase() : '';

/**
 * .what = check if error is expected filesystem error
 * .why = distinguishes recoverable fs errors from unexpected throws
 */
export const isExpectedFsError = (input: { error: unknown }): boolean => {
  const msg = getErrorMessage({ error: input.error });
  return (
    msg.includes('enoent') ||
    msg.includes('eacces') ||
    msg.includes('permission')
  );
};

/**
 * .what = check if error is expected context/evaluation error
 * .why = page context errors are common after navigation; handle gracefully
 */
export const isExpectedContextError = (input: { error: unknown }): boolean => {
  const msg = getErrorMessage({ error: input.error });
  return (
    msg.includes('context') ||
    msg.includes('destroyed') ||
    msg.includes('target closed') ||
    msg.includes('execution context') ||
    msg.includes('navigation')
  );
};

/**
 * .what = check if error is expected screenshot/context error
 * .why = screenshot failures from context or time issues should not crash
 */
export const isExpectedScreenshotError = (input: {
  error: unknown;
}): boolean => {
  const msg = getErrorMessage({ error: input.error });
  return (
    msg.includes('context') ||
    msg.includes('destroyed') ||
    msg.includes('target closed') ||
    msg.includes('navigation') ||
    msg.includes('timeout') ||
    msg.includes('screenshot')
  );
};

/**
 * .what = emit success output for standalone mode
 * .why = provides lizard vibes feedback when skill runs directly
 */
export const emitStandaloneSuccess = (input: {
  skillName: string;
  outputFile: string;
}): void => {
  console.log('🦎 toasty');
  console.log('');
  console.log('📽️ ' + input.skillName);
  console.log('   └─ ' + input.outputFile);
};

/**
 * .what = emit success output for sub-skill mode
 * .why = provides tree-structured feedback when skill runs as part of composite
 */
export const emitSubskillSuccess = (input: { artifactName: string }): void => {
  console.log('   ├─ ✓ ' + input.artifactName);
};

/**
 * .what = emit error output for standalone mode
 * .why = provides lizard vibes error feedback when skill runs directly
 */
export const emitStandaloneError = (input: {
  skillName: string;
  errorInfo: string;
}): void => {
  console.error('🦎 cold snap');
  console.error('');
  console.error('📽️ ' + input.skillName);
  console.error('   └─ ⚠ unavailable: ' + input.errorInfo);
};

/**
 * .what = emit error output for sub-skill mode
 * .why = provides tree-structured error feedback when skill runs as part of composite
 */
export const emitSubskillError = (input: {
  artifactName: string;
  errorInfo: string;
}): void => {
  console.error(
    '   ├─ 🦎 ' +
      input.artifactName +
      ' (unavailable: ' +
      input.errorInfo +
      ')',
  );
};

/**
 * .what = connect to browser via CDP
 * .why = establishes connection to browser for automation
 */
export const connectToBrowser = async (input: {
  wsEndpoint: string;
}): Promise<ConnectedBrowser> => {
  return chromium.connectOverCDP(input.wsEndpoint);
};

/**
 * .what = ensure output directory exists
 * .why = creates parent directories before file write to prevent ENOENT
 */
export const ensureOutputDir = (input: { outputPath: string }): void => {
  const outputDir = path.dirname(input.outputPath);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
};

/**
 * .what = safely extract message from error
 * .why = enables error message access without as cast
 */
export const getErrorMessageSafe = (input: { error: unknown }): string =>
  isError(input.error) ? input.error.message : String(input.error);

/**
 * .what = safely extract stack from error
 * .why = enables error stack access without as cast
 */
export const getErrorStackSafe = (input: {
  error: unknown;
}): string | undefined =>
  isError(input.error) ? input.error.stack : undefined;

export interface SnapshotRunnerInput<T> {
  wsEndpoint: string;
  tabIndex: number;
  outputFile: string;
  standalone: boolean;
  skillName: string;
  snapshotFn: (input: {
    browser: ConnectedBrowser;
    tabIndex: number;
    outputFile: string;
    standalone: boolean;
  }) => Promise<T & { success: boolean }>;
}

/**
 * .what = run snapshot function with standard CLI wrapper
 * .why = eliminates duplication across snapshot CLI entry points
 */
export const runSnapshotWithCli = async <T>(
  input: SnapshotRunnerInput<T>,
): Promise<void> => {
  try {
    const browser = await connectToBrowser({ wsEndpoint: input.wsEndpoint });
    const result = await input.snapshotFn({
      browser,
      tabIndex: input.tabIndex,
      outputFile: input.outputFile,
      standalone: input.standalone,
    });
    await browser.close();

    if (!result.success) {
      process.exit(2);
    }
  } catch (e) {
    /**
     * .note = process boundary handler (CLI entry point)
     * .why = .wrap isn't appropriate here because we must exit with codes, not rethrow.
     *        at process boundaries, errors terminate in exit codes for shell callers.
     */
    if (isExpectedHelpfulErrorType({ error: e })) {
      console.error(formatErrorForTree({ error: e }));
      process.exit(determineExitCodeForError({ error: e }));
    }

    // unexpected error: wrap for visibility and exit 1
    const wrapped = new UnexpectedCodePathError(
      'unexpected error in ' + input.skillName,
      {
        tabIndex: input.tabIndex,
        outputFile: input.outputFile,
        originalMessage: getErrorMessageSafe({ error: e }),
        originalStack: getErrorStackSafe({ error: e }),
        hint: 'this should not happen - check originalStack for root cause',
      },
    );
    console.error(formatErrorForTree({ error: wrapped }));
    process.exit(1);
  }
};

/**
 * .what = parse CLI argument by name from argv array
 * .why = eliminates decode-friction from indexOf + positional access pattern
 */
export const getCliArg = (input: {
  args: string[];
  name: string;
}): string | undefined => {
  const flagIndex = input.args.indexOf(`--${input.name}`);
  if (flagIndex < 0) return undefined;
  return input.args[flagIndex + 1];
};

/**
 * .what = check if CLI flag is present in argv array
 * .why = eliminates decode-friction from includes pattern
 */
export const hasCliFlag = (input: { args: string[]; name: string }): boolean =>
  input.args.includes(`--${input.name}`);

/**
 * .what = handle error at process boundary (CLI entry point)
 * .why = eliminates duplicated error handler across CLI orchestrators
 * .note = process boundaries must exit with codes, not rethrow
 */
export const handleProcessBoundaryError = (input: {
  error: unknown;
  skillName: string;
  context: Record<string, unknown>;
}): never => {
  // expected errors: log and exit with semantic code
  if (isExpectedHelpfulErrorType({ error: input.error })) {
    console.error(formatErrorForTree({ error: input.error }));
    process.exit(determineExitCodeForError({ error: input.error }));
  }

  // unexpected error: wrap for visibility and exit 1
  const wrapped = new UnexpectedCodePathError(
    'unexpected error in ' + input.skillName,
    {
      ...input.context,
      originalMessage: getErrorMessageSafe({ error: input.error }),
      originalStack: getErrorStackSafe({ error: input.error }),
      hint: 'this should not happen - check originalStack for root cause',
    },
  );
  console.error(formatErrorForTree({ error: wrapped }));
  process.exit(1);
};

/**
 * .what = emit snapshot result based on standalone mode
 * .why = eliminates duplicated if/else standalone emit pattern
 */
export const emitSnapshotResultSuccess = (input: {
  standalone: boolean;
  skillName: string;
  artifactName: string;
  outputFile: string;
}): void => {
  if (input.standalone)
    emitStandaloneSuccess({
      skillName: input.skillName,
      outputFile: input.outputFile,
    });
  if (!input.standalone)
    emitSubskillSuccess({ artifactName: input.artifactName });
};

/**
 * .what = emit snapshot error based on standalone mode
 * .why = eliminates duplicated if/else standalone emit pattern
 */
export const emitSnapshotResultError = (input: {
  standalone: boolean;
  skillName: string;
  artifactName: string;
  errorInfo: string;
}): void => {
  if (input.standalone)
    emitStandaloneError({
      skillName: input.skillName,
      errorInfo: input.errorInfo,
    });
  if (!input.standalone)
    emitSubskillError({
      artifactName: input.artifactName,
      errorInfo: input.errorInfo,
    });
};
