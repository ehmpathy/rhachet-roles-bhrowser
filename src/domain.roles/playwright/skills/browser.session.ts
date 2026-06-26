/**
 * .what = manage browser session state (cookies, localStorage)
 * .why = enables CLI invocation for session operations via npx tsx
 */
import * as fs from 'fs';
import { BadRequestError } from 'helpful-errors';
import { chromium } from 'playwright';

import { getCliArg, handleProcessBoundaryError } from './lib/shared';

// type for storage state structure
interface StorageState {
  cookies?: Array<{ name: string; value: string }>;
  origins?: Array<{
    origin: string;
    localStorage?: Array<{ name: string; value: string }>;
  }>;
}

/**
 * .what = read storage state from file
 * .why = communicator for filesystem I/O
 */
const readStorageStateFromFile = (input: { filePath: string }): StorageState =>
  JSON.parse(fs.readFileSync(input.filePath, 'utf-8'));

/**
 * .what = write storage state to file
 * .why = communicator for filesystem I/O
 */
const writeStorageStateToFile = (input: {
  filePath: string;
  state: StorageState;
}): void => {
  fs.writeFileSync(input.filePath, JSON.stringify(input.state, null, 2));
};

/**
 * .what = count cookies in storage state
 * .why = provides summary metric for session state
 */
const getCookieCount = (input: { state: StorageState }): number =>
  input.state.cookies?.length ?? 0;

/**
 * .what = extract localStorage key names from origins
 * .why = provides visibility into localStorage contents
 */
const extractLocalStorageKeys = (input: {
  origins: StorageState['origins'];
}): string[] =>
  (input.origins ?? []).flatMap(
    (o) => o.localStorage?.map((ls) => ls.name) ?? [],
  );

/**
 * .what = count localStorage keys from origins
 * .why = provides summary metric for session state
 */
const countLocalStorageKeys = (input: {
  origins: StorageState['origins'];
}): number => extractLocalStorageKeys({ origins: input.origins }).length;

/**
 * .what = format keys as tree list
 * .why = provides lizard vibes tree output for localStorage keys
 */
const formatKeysAsTree = (input: { keys: string[] }): string => {
  if (input.keys.length === 0) {
    return '      └─ (empty)';
  }
  const lines: string[] = [];
  const keysBeforeLast = input.keys.slice(0, -1);
  const keyLast = input.keys[input.keys.length - 1];
  keysBeforeLast.forEach((key) => {
    lines.push('      ├─ ' + key);
  });
  lines.push('      └─ ' + keyLast);
  return lines.join('\n');
};

/**
 * .what = get primary browser context (first context)
 * .why = browsers have multiple contexts; primary holds user-visible tabs
 */
const getPrimaryContext = (
  browser: Awaited<ReturnType<typeof chromium.connectOverCDP>>,
) => {
  const contexts = browser.contexts();
  if (contexts.length === 0) return null;
  return contexts[0];
};

/**
 * .what = check if storageState lacks both cookies and origins
 * .why = validates file is valid playwright storageState format
 */
const lacksStorageStateData = (input: { state: StorageState }): boolean =>
  !input.state.cookies && !input.state.origins;

/**
 * .what = handle session get subcommand
 * .why = inspects and displays session state
 */
const handleSessionGet = (input: {
  session: string;
  storageStateFile: string;
}): void => {
  const state = readStorageStateFromFile({ filePath: input.storageStateFile });
  const cookieCount = getCookieCount({ state });
  const localStorageKeys = extractLocalStorageKeys({ origins: state.origins });

  console.log('🦎 toasty');
  console.log('');
  console.log('📽️ browser.session get');
  console.log('   ├─ session: ' + input.session);
  console.log('   ├─ state: ' + input.storageStateFile);
  console.log('   ├─ cookies: ' + cookieCount);
  console.log('   └─ localStorage');
  console.log(formatKeysAsTree({ keys: localStorageKeys }));
};

/**
 * .what = handle session set from @storage (active browser)
 * .why = extracts session state from browser into file
 */
const handleSessionSetFromStorage = async (input: {
  session: string;
  storageStateFile: string;
  wsEndpoint: string;
}): Promise<void> => {
  const browser = await chromium.connectOverCDP(input.wsEndpoint);
  const context = getPrimaryContext(browser);

  // guard: context must exist
  if (!context)
    BadRequestError.throw('no browser context found', {
      session: input.session,
      hint: 'browser may have no open pages — open a tab first',
    });

  const storageState = await context.storageState();

  // write via communicator
  writeStorageStateToFile({
    filePath: input.storageStateFile,
    state: storageState,
  });

  const cookieCount = getCookieCount({ state: storageState });
  const localStorageKeyCount = countLocalStorageKeys({
    origins: storageState.origins,
  });

  console.log('🦎 toasty');
  console.log('');
  console.log('📽️ browser.session set');
  console.log('   ├─ session: ' + input.session);
  console.log('   ├─ source: @storage (active browser)');
  console.log('   ├─ state: ' + input.storageStateFile);
  console.log('   ├─ cookies: ' + cookieCount);
  console.log('   └─ localStorage keys: ' + localStorageKeyCount);

  await browser.close();
};

/**
 * .what = validate storageState JSON file
 * .why = ensures file is valid playwright storageState format before copy
 */
const validateStorageStateFile = (input: { fromSource: string }): void => {
  const state = readStorageStateFromFile({ filePath: input.fromSource });
  if (lacksStorageStateData({ state }))
    BadRequestError.throw(
      'invalid storageState format (no cookies or origins)',
      {
        file: input.fromSource,
        hint: 'file must be valid playwright storageState with cookies or origins',
      },
    );
};

/**
 * .what = handle session set from file
 * .why = imports session state from file into session dir
 */
const handleSessionSetFromFile = (input: {
  session: string;
  storageStateFile: string;
  fromSource: string;
}): void => {
  // read and count contents of copied file via communicator
  const state = readStorageStateFromFile({ filePath: input.storageStateFile });
  const cookieCount = getCookieCount({ state });
  const localStorageKeyCount = countLocalStorageKeys({
    origins: state.origins,
  });

  console.log('🦎 toasty');
  console.log('');
  console.log('📽️ browser.session set');
  console.log('   ├─ session: ' + input.session);
  console.log('   ├─ source: ' + input.fromSource);
  console.log('   ├─ state: ' + input.storageStateFile);
  console.log('   ├─ cookies: ' + cookieCount);
  console.log('   └─ localStorage keys: ' + localStorageKeyCount);
};

/**
 * .what = dispatch session subcommand to handler
 * .why = isolates subcommand dispatch from CLI orchestration
 */
const dispatchSessionSubcommand = async (input: {
  subcommand: string;
  session: string;
  storageStateFile: string;
  fromSource?: string;
  wsEndpoint?: string;
}): Promise<void> => {
  const { subcommand, session, storageStateFile, fromSource, wsEndpoint } =
    input;

  // dispatch to handler based on subcommand
  if (subcommand === 'get')
    return handleSessionGet({ session, storageStateFile });

  if (subcommand === 'set-from-storage') {
    if (!wsEndpoint)
      BadRequestError.throw('wsEndpoint required for set-from-storage');
    return handleSessionSetFromStorage({
      session,
      storageStateFile,
      wsEndpoint,
    });
  }

  if (subcommand === 'validate-storage-state') {
    if (!fromSource)
      BadRequestError.throw('fromSource required for validate-storage-state');
    return validateStorageStateFile({ fromSource });
  }

  if (subcommand === 'set-from-file') {
    if (!fromSource)
      BadRequestError.throw('fromSource required for set-from-file');
    return handleSessionSetFromFile({ session, storageStateFile, fromSource });
  }

  // unknown subcommand
  BadRequestError.throw('unknown subcommand', {
    subcommand,
    valid: [
      'get',
      'set-from-storage',
      'validate-storage-state',
      'set-from-file',
    ],
  });
};

/**
 * .what = run session operation as CLI entry point
 * .why = enables invocation from shell scripts via npx tsx
 * .note = process boundary: must catch all errors and exit with semantic codes
 *         (cannot use HelpfulError.wrap — must exit process, not rethrow)
 */
const runBrowserSession = async (args: {
  subcommand: string;
  session: string;
  storageStateFile: string;
  fromSource?: string;
  wsEndpoint?: string;
}): Promise<void> => {
  try {
    await dispatchSessionSubcommand(args);
  } catch (e) {
    handleProcessBoundaryError({
      error: e,
      skillName: 'browser.session',
      context: { subcommand: args.subcommand, session: args.session },
    });
  }
};

// CLI entry point: invoke when run directly via npx tsx
// usage: npx tsx browser.session.ts --subcommand get --session NAME --storageStateFile PATH
if (require.main === module) {
  const args = process.argv.slice(2);

  const subcommand = getCliArg({ args, name: 'subcommand' });
  const session = getCliArg({ args, name: 'session' });
  const storageStateFile = getCliArg({ args, name: 'storageStateFile' });
  const fromSource = getCliArg({ args, name: 'fromSource' });
  const wsEndpoint = getCliArg({ args, name: 'wsEndpoint' });

  if (!subcommand || !session || !storageStateFile) {
    console.error(
      'usage: npx tsx browser.session.ts --subcommand CMD --session NAME --storageStateFile PATH [--fromSource PATH] [--wsEndpoint URL]',
    );
    process.exit(2);
  }

  void runBrowserSession({
    subcommand,
    session,
    storageStateFile,
    fromSource,
    wsEndpoint,
  });
}
