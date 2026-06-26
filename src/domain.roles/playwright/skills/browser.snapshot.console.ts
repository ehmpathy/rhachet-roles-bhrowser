/**
 * .what = capture console log entries from browser tab
 * .why = enables JS errors and debug output for diagnosis, importable by code
 */
import * as fs from 'fs';
import { BadRequestError } from 'helpful-errors';
import type { ConsoleMessage, Page } from 'playwright';

import {
  type ConnectedBrowser,
  emitSnapshotResultError,
  emitSnapshotResultSuccess,
  formatErrorWithContext,
  getCliArg,
  getPageAtTabIndex,
  getPagesFromPrimaryContext,
  hasCliFlag,
  isExpectedFsError,
  runSnapshotWithCli,
} from './lib/shared';

export interface SnapshotConsoleInput {
  browser: ConnectedBrowser;
  tabIndex: number;
  outputFile: string;
  standalone: boolean;
}

export interface ConsoleEntry {
  type: string;
  text: string;
  timestamp: string;
  location: string | null;
}

export interface PageErrorEntry {
  type: 'error';
  text: string;
  timestamp: string;
}

export interface ConsoleSnapshot {
  note: string;
  entries: ConsoleEntry[];
  errors: PageErrorEntry[];
}

export interface SnapshotConsoleOutput {
  success: boolean;
  outputFile: string;
  console?: ConsoleSnapshot;
  error?: string;
}

/**
 * .what = get current timestamp as ISO string
 */
const getCurrentTimestamp = (): string => new Date().toISOString();

/**
 * .what = format console message entry for collection
 */
const formatConsoleEntry = (msg: ConsoleMessage): ConsoleEntry => ({
  type: msg.type(),
  text: msg.text(),
  timestamp: getCurrentTimestamp(),
  location: msg.location()
    ? `${msg.location().url}:${msg.location().lineNumber}`
    : null,
});

/**
 * .what = format page error entry for collection
 */
const formatPageErrorEntry = (err: Error): PageErrorEntry => ({
  type: 'error',
  text: err.message,
  timestamp: getCurrentTimestamp(),
});

/**
 * .what = create collector for console entries via listeners
 * .why = event handlers require mutable state for async collection
 * .note = deliberate mutation: event collectors inherently accumulate state
 */
const createConsoleCollector = (input: {
  page: Page;
}): { getSnapshot: () => ConsoleSnapshot } => {
  // .note = deliberate mutation zone: event handlers accumulate entries
  const entries: ConsoleEntry[] = [];
  const errors: PageErrorEntry[] = [];

  input.page.on('console', (msg) => entries.push(formatConsoleEntry(msg)));
  input.page.on('pageerror', (err) => errors.push(formatPageErrorEntry(err)));

  return {
    getSnapshot: (): ConsoleSnapshot => ({
      note: 'only captures logs after listener attached; historical logs unavailable',
      entries: [...entries], // immutable copy
      errors: [...errors], // immutable copy
    }),
  };
};

/**
 * .what = collect console entries from page via listeners
 * .why = provides async collection window for console output
 */
const collectConsoleEntries = async (input: {
  page: Page;
}): Promise<ConsoleSnapshot> => {
  const collector = createConsoleCollector({ page: input.page });

  // trigger a small wait to capture any queued logs
  await input.page.waitForTimeout(100);

  return collector.getSnapshot();
};

/**
 * .what = write console snapshot to file
 * .why = communicator for filesystem I/O (isolates I/O from orchestrator)
 */
const writeConsoleSnapshotToFile = (input: {
  outputFile: string;
  snapshot: ConsoleSnapshot;
  standalone: boolean;
}): void => {
  try {
    fs.writeFileSync(input.outputFile, JSON.stringify(input.snapshot, null, 2));
  } catch (e) {
    if (!isExpectedFsError({ error: e })) throw e;
    const errorInfo = formatErrorWithContext({ error: e });
    emitSnapshotResultError({
      standalone: input.standalone,
      skillName: 'browser.snapshot console',
      artifactName: 'snapshot.console.json',
      errorInfo,
    });
    BadRequestError.throw('failed to write console snapshot', {
      outputFile: input.outputFile,
      error: errorInfo,
      hint: 'check file path and permissions',
      cause: e instanceof Error ? e : undefined,
    });
  }
};

/**
 * .what = capture console log entries from browser tab
 */
export const snapshotConsole = async (
  input: SnapshotConsoleInput,
): Promise<SnapshotConsoleOutput> => {
  const { browser, tabIndex, outputFile, standalone } = input;

  const pages = getPagesFromPrimaryContext({ browser });
  const page = getPageAtTabIndex({ pages, tabIndex });

  // guard: tab must exist at requested index
  if (!page)
    BadRequestError.throw(`tab ${tabIndex} not found`, {
      tabIndex,
      tabsAvailable: pages.length,
      outputFile,
      hint: 'run browser.describe to list available tabs',
    });

  // wait for content before capture
  await page.waitForLoadState('domcontentloaded');

  // collect console entries via named transformer
  const output = await collectConsoleEntries({ page });

  // write to filesystem via communicator
  writeConsoleSnapshotToFile({ outputFile, snapshot: output, standalone });

  emitSnapshotResultSuccess({
    standalone,
    skillName: 'browser.snapshot console',
    artifactName: 'snapshot.console.json',
    outputFile,
  });
  return { success: true, outputFile, console: output };
};

// cli entry point: invoke when run directly via npx tsx
// usage: npx tsx browser.snapshot.console.ts --wsEndpoint WS_URL --tabIndex N --outputFile PATH [--standalone]
if (require.main === module) {
  const args = process.argv.slice(2);

  const wsEndpoint = getCliArg({ args, name: 'wsEndpoint' });
  const tabIndex = getCliArg({ args, name: 'tabIndex' });
  const outputFile = getCliArg({ args, name: 'outputFile' });
  const standalone = hasCliFlag({ args, name: 'standalone' });

  if (!wsEndpoint || tabIndex === undefined || !outputFile) {
    console.error(
      'usage: npx tsx browser.snapshot.console.ts --wsEndpoint WS_URL --tabIndex N --outputFile PATH [--standalone]',
    );
    process.exit(2);
  }

  void runSnapshotWithCli({
    wsEndpoint,
    tabIndex: parseInt(tabIndex, 10),
    outputFile,
    standalone,
    skillName: 'browser.snapshot console',
    snapshotFn: snapshotConsole,
  });
}
