/**
 * .what = describe tabs open in the persistent browser
 * .why = enables CLI invocation with proper error handle via npx tsx
 */
import type { Page } from 'playwright';

import {
  type ConnectedBrowser,
  connectToBrowser,
  getCliArg,
  getPagesFromPrimaryContext,
  handleProcessBoundaryError,
  isExpectedContextError,
} from './lib/shared';

/**
 * .what = check if page has document focus
 * .why = identifies which tab user is active on
 */
const checkPageFocus = async (input: { page: Page }): Promise<boolean> => {
  try {
    return await input.page.evaluate(() => document.hasFocus());
  } catch (err) {
    if (!isExpectedContextError({ error: err })) throw err;
    return false;
  }
};

/**
 * .what = find index of first item that satisfies async predicate
 * .why = enables async search through pages array
 */
const findIndexByAsyncPredicate = async <T>(input: {
  items: T[];
  predicate: (item: T) => Promise<boolean>;
}): Promise<number> => {
  for (const [index, item] of input.items.entries()) {
    const satisfied = await input.predicate(item);
    if (satisfied) return index;
  }
  return -1;
};

/**
 * .what = find index of focused page in pages array
 * .why = identifies which tab has document focus
 */
const findFocusedIndex = async (input: { pages: Page[] }): Promise<number> =>
  findIndexByAsyncPredicate({
    items: input.pages,
    predicate: async (page) => checkPageFocus({ page }),
  });

/**
 * .what = get page info with fallback for context errors
 * .why = gracefully handles destroyed/unavailable pages
 */
const getPageInfo = async (input: {
  page: Page;
}): Promise<{ title: string; url: string; available: boolean }> => {
  try {
    const title = await input.page.title();
    const url = input.page.url();
    return { title: title || '(no title)', url, available: true };
  } catch (err) {
    if (!isExpectedContextError({ error: err })) throw err;
    return {
      title: '(page unavailable)',
      url: '(context destroyed)',
      available: false,
    };
  }
};

/**
 * .what = get tree prefix for index
 * .why = formats tree structure with correct branch character
 */
const getTreePrefix = (input: {
  index: number;
  total: number;
}): { prefix: string; indent: string } => {
  const isLast = input.index === input.total - 1;
  return {
    prefix: isLast ? '   └─' : '   ├─',
    indent: isLast ? '      ' : '   │  ',
  };
};

/**
 * .what = format focused marker
 * .why = indicates which tab has focus in output
 */
const getFocusedMarker = (input: {
  index: number;
  focusedIndex: number;
}): string => (input.index === input.focusedIndex ? ' ← focused' : '');

/**
 * .what = emit describe header output
 * .why = communicator encapsulates console.log I/O for describe header
 */
const emitDescribeHeader = (input: {
  session: string;
  tabCount: number;
}): void => {
  console.log('🦎 rock solid');
  console.log('');
  console.log('📽️ browser.describe');
  console.log('   ├─ session: ' + input.session);
  console.log('   ├─ tabs: ' + input.tabCount);
  console.log('   │');
};

/**
 * .what = emit no contexts found output
 * .why = communicator encapsulates console.log I/O for empty state
 */
const emitNoContextsFound = (input: { session: string }): void => {
  console.log('🦎 rock solid');
  console.log('');
  console.log('📽️ browser.describe');
  console.log('   ├─ session: ' + input.session);
  console.log('   │');
  console.log('   └─ no browser contexts found');
};

/**
 * .what = emit page entry lines
 * .why = communicator encapsulates console.log I/O for page output
 */
const emitPageEntry = (input: { lines: string[] }): void => {
  input.lines.forEach((line) => console.log(line));
};

/**
 * .what = format page entry for tree output
 * .why = creates formatted line(s) for a single tab
 */
const formatPageEntry = async (input: {
  page: Page;
  index: number;
  total: number;
  focusedIndex: number;
}): Promise<string[]> => {
  const { prefix, indent } = getTreePrefix({
    index: input.index,
    total: input.total,
  });
  const focusedMarker = getFocusedMarker({
    index: input.index,
    focusedIndex: input.focusedIndex,
  });
  const info = await getPageInfo({ page: input.page });
  return [
    prefix + ' [' + input.index + '] ' + info.title + focusedMarker,
    indent + info.url,
  ];
};

/**
 * .what = print all pages as tree
 * .why = outputs all tabs in lizard vibes tree format
 */
const printPagesAsTree = async (input: {
  pages: Page[];
  focusedIndex: number;
}): Promise<void> => {
  const total = input.pages.length;
  for (const [index, page] of input.pages.entries()) {
    const lines = await formatPageEntry({
      page,
      index,
      total,
      focusedIndex: input.focusedIndex,
    });
    emitPageEntry({ lines });
  }
};

export interface DescribeTabsInput {
  browser: ConnectedBrowser;
  session: string;
}

export interface DescribeTabsOutput {
  session: string;
  tabCount: number;
  focusedIndex: number;
}

/**
 * .what = describe tabs in browser
 * .why = core logic for tab enumeration
 */
export const describeTabs = async (
  input: DescribeTabsInput,
): Promise<DescribeTabsOutput | null> => {
  const pages = getPagesFromPrimaryContext({ browser: input.browser });

  if (pages.length === 0) {
    emitNoContextsFound({ session: input.session });
    return null;
  }

  emitDescribeHeader({ session: input.session, tabCount: pages.length });

  const focusedIndex = await findFocusedIndex({ pages });
  await printPagesAsTree({ pages, focusedIndex });

  return {
    session: input.session,
    tabCount: pages.length,
    focusedIndex,
  };
};

/**
 * .what = run describe as CLI entry point
 * .why = enables invocation from shell scripts via npx tsx
 */
const runBrowserDescribe = async (args: {
  wsEndpoint: string;
  session: string;
}): Promise<void> => {
  try {
    const browser = await connectToBrowser({ wsEndpoint: args.wsEndpoint });
    await describeTabs({ browser, session: args.session });
    await browser.close();
  } catch (e) {
    handleProcessBoundaryError({
      error: e,
      skillName: 'browser.describe',
      context: { session: args.session },
    });
  }
};

// CLI entry point: invoke when run directly via npx tsx
// usage: npx tsx browser.describe.ts --wsEndpoint WS_URL --session NAME
if (require.main === module) {
  const args = process.argv.slice(2);

  const wsEndpoint = getCliArg({ args, name: 'wsEndpoint' });
  const session = getCliArg({ args, name: 'session' });

  if (!wsEndpoint || !session) {
    console.error(
      'usage: npx tsx browser.describe.ts --wsEndpoint WS_URL --session NAME',
    );
    process.exit(2);
  }

  void runBrowserDescribe({ wsEndpoint, session });
}
