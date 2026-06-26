/**
 * .what = capture screenshot of browser tab
 * .why = visual record of page state, importable by code
 */
import { BadRequestError, MalfunctionError } from 'helpful-errors';
import type { Page } from 'playwright';

import {
  type ConnectedBrowser,
  connectToBrowser,
  emitSnapshotResultError,
  emitSnapshotResultSuccess,
  ensureOutputDir,
  formatErrorWithContext,
  getCliArg,
  getPageAtTabIndex,
  getPagesFromPrimaryContext,
  handleProcessBoundaryError,
  hasCliFlag,
  isExpectedScreenshotError,
} from './lib/shared';

export interface SnapshotScreenInput {
  browser: ConnectedBrowser;
  tabIndex: number;
  outputFile: string;
  awaitState: 'domcontentloaded' | 'load' | 'networkidle' | null;
  standalone: boolean;
}

export interface SnapshotScreenOutput {
  success: boolean;
  outputFile: string;
  error?: string;
}

/**
 * .what = capture screenshot via playwright SDK
 * .why = communicator encapsulates raw page.screenshot() SDK call
 */
const capturePageScreenshot = async (input: {
  page: Page;
  path: string;
}): Promise<void> => {
  await input.page.screenshot({
    path: input.path,
    timeout: 30000,
    caret: 'hide',
    animations: 'disabled',
  });
};

/**
 * .what = capture screenshot of browser tab
 */
export const snapshotScreen = async (
  input: SnapshotScreenInput,
): Promise<SnapshotScreenOutput> => {
  const { browser, tabIndex, outputFile, awaitState, standalone } = input;

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

  try {
    // optionally wait for page state if --await provided
    if (awaitState) {
      await page.waitForLoadState(awaitState);
    }

    // bring page to front to ensure it's not throttled by Chrome
    await page.bringToFront();

    // ensure output directory exists
    ensureOutputDir({ outputPath: outputFile });

    // capture screenshot via communicator
    await capturePageScreenshot({ page, path: outputFile });
  } catch (e) {
    if (!isExpectedScreenshotError({ error: e })) throw e;
    const errorInfo = formatErrorWithContext({ error: e });
    emitSnapshotResultError({
      standalone,
      skillName: 'browser.snapshot screen',
      artifactName: 'snapshot.png',
      errorInfo,
    });
    MalfunctionError.throw('failed to capture screenshot', {
      outputFile,
      error: errorInfo,
      hint: 'page may have crashed or become unresponsive',
      cause: e instanceof Error ? e : undefined,
    });
  }

  emitSnapshotResultSuccess({
    standalone,
    skillName: 'browser.snapshot screen',
    artifactName: 'snapshot.png',
    outputFile,
  });

  return { success: true, outputFile };
};

/**
 * .what = parse awaitState string to typed value
 * .why = validates cli input against allowed enum values
 */
const parseAwaitState = (input: {
  value: string | null;
}): SnapshotScreenInput['awaitState'] => {
  if (!input.value) return null;
  if (input.value === 'domcontentloaded') return 'domcontentloaded';
  if (input.value === 'load') return 'load';
  if (input.value === 'networkidle') return 'networkidle';
  return null;
};

/**
 * .what = run snapshot screen as CLI entry point
 * .why = enables invocation from shell scripts via npx tsx
 */
const runSnapshotScreen = async (args: {
  wsEndpoint: string;
  tabIndex: number;
  outputFile: string;
  awaitState: string | null;
  standalone: boolean;
}): Promise<void> => {
  try {
    const browser = await connectToBrowser({ wsEndpoint: args.wsEndpoint });
    const result = await snapshotScreen({
      browser,
      tabIndex: args.tabIndex,
      outputFile: args.outputFile,
      awaitState: parseAwaitState({ value: args.awaitState }),
      standalone: args.standalone,
    });
    await browser.close();

    if (!result.success) {
      process.exit(2);
    }
  } catch (e) {
    handleProcessBoundaryError({
      error: e,
      skillName: 'browser.snapshot screen',
      context: { tabIndex: args.tabIndex, outputFile: args.outputFile },
    });
  }
};

// CLI entry point: invoke when run directly via npx tsx
// usage: npx tsx browser.snapshot.screen.ts --wsEndpoint WS_URL --tabIndex N --outputFile PATH [--awaitState STATE] [--standalone]
if (require.main === module) {
  const args = process.argv.slice(2);

  const wsEndpoint = getCliArg({ args, name: 'wsEndpoint' });
  const tabIndex = getCliArg({ args, name: 'tabIndex' });
  const outputFile = getCliArg({ args, name: 'outputFile' });
  const awaitState = getCliArg({ args, name: 'awaitState' }) ?? null;
  const standalone = hasCliFlag({ args, name: 'standalone' });

  if (!wsEndpoint || tabIndex === undefined || !outputFile) {
    console.error(
      'usage: npx tsx browser.snapshot.screen.ts --wsEndpoint WS_URL --tabIndex N --outputFile PATH [--awaitState STATE] [--standalone]',
    );
    process.exit(2);
  }

  void runSnapshotScreen({
    wsEndpoint,
    tabIndex: parseInt(tabIndex, 10),
    outputFile,
    awaitState,
    standalone,
  });
}
