/**
 * .what = execute browser playbook action
 * .why = enables playbook execution via CLI with proper error handle
 */
import { BadRequestError } from 'helpful-errors';

import {
  type ConnectedBrowser,
  connectToBrowser,
  getCliArg,
  getPageAtTabIndex,
  getPagesFromPrimaryContext,
  handleProcessBoundaryError,
} from './lib/shared';

export interface ActionInput {
  page: Awaited<ReturnType<typeof getPagesFromPrimaryContext>>[number];
  browser: ConnectedBrowser;
}

export interface ExecuteActionInput {
  browser: ConnectedBrowser;
  tabIndex: number;
  playbook: string;
  session: string;
  action: (input: ActionInput) => Promise<unknown>;
}

export interface ExecuteActionOutput {
  success: boolean;
  urlBefore: string;
  urlAfter: string;
  result?: unknown;
}

/**
 * .what = emit action progress output
 * .why = communicator encapsulates console.log I/O for action progress
 */
const emitActionProgress = (input: {
  urlBefore: string;
  urlAfter: string;
  result: unknown;
}): void => {
  console.log('   ├─ url before: ' + input.urlBefore);
  console.log('   ├─ url after: ' + input.urlAfter);
  if (input.result) {
    console.log('   ├─ result: ' + JSON.stringify(input.result));
  }
  console.log('   └─ done');
};

/**
 * .what = execute playbook action on browser tab
 * .why = isolated function for test and composition
 */
export const executeAction = async (
  input: ExecuteActionInput,
): Promise<ExecuteActionOutput> => {
  const { browser, tabIndex, session, action } = input;

  const pages = getPagesFromPrimaryContext({ browser });
  const page = getPageAtTabIndex({ pages, tabIndex });

  // guard: tab must exist at requested index
  if (!page)
    BadRequestError.throw(`tab ${tabIndex} not found`, {
      tabIndex,
      totalTabs: pages.length,
      session,
      hint: `run browser.describe --session ${session} to list tabs`,
    });

  const urlBefore = page.url();
  const result = await action({ page, browser });
  const urlAfter = page.url();

  emitActionProgress({ urlBefore, urlAfter, result });

  return { success: true, urlBefore, urlAfter, result };
};

/**
 * .what = run action as CLI entry point
 * .why = enables invocation from shell scripts via npx tsx
 */
const runBrowserAction = async (args: {
  wsEndpoint: string;
  tabIndex: number;
  playbook: string;
  session: string;
}): Promise<void> => {
  try {
    // dynamic import of playbook module
    const playbookModule = await import(args.playbook);
    if (typeof playbookModule.action !== 'function') {
      BadRequestError.throw('playbook must export an action function', {
        playbook: args.playbook,
        exports: Object.keys(playbookModule),
        hint: 'export const action = async ({ page, browser }) => { ... }',
      });
    }

    const browser = await connectToBrowser({ wsEndpoint: args.wsEndpoint });
    await executeAction({
      browser,
      tabIndex: args.tabIndex,
      playbook: args.playbook,
      session: args.session,
      action: playbookModule.action,
    });
    await browser.close();
  } catch (e) {
    handleProcessBoundaryError({
      error: e,
      skillName: 'browser.action',
      context: {
        playbook: args.playbook,
        tabIndex: args.tabIndex,
        session: args.session,
      },
    });
  }
};

// CLI entry point: invoke when run directly via npx tsx
// usage: npx tsx browser.action.ts --wsEndpoint WS_URL --tabIndex N --playbook PATH --session NAME
if (require.main === module) {
  const args = process.argv.slice(2);
  const wsEndpoint = getCliArg({ args, name: 'wsEndpoint' });
  const tabIndex = getCliArg({ args, name: 'tabIndex' });
  const playbook = getCliArg({ args, name: 'playbook' });
  const session = getCliArg({ args, name: 'session' });

  if (!wsEndpoint || tabIndex === undefined || !playbook || !session) {
    console.error(
      'usage: npx tsx browser.action.ts --wsEndpoint WS_URL --tabIndex N --playbook PATH --session NAME',
    );
    process.exit(2);
  }

  void runBrowserAction({
    wsEndpoint,
    tabIndex: parseInt(tabIndex, 10),
    playbook,
    session,
  });
}
