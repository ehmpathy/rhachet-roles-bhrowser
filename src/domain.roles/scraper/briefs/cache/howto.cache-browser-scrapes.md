# howto.cache-browser-scrapes

## .what

guide for cache browser scrape results with `with-remote-state-cache`.

## .why

browser automation is slow and expensive. cache results to:
- avoid repeated scrapes of unchanged data
- speed up declastruct plan runs from minutes to seconds
- reduce risk of rate limits and bot detection

## .dependencies

```bash
pnpm add with-remote-state-cache simple-on-disk-cache domain-objects hash-fns
```

## .setup

### 1. create cache context

create `src/infra/performance/withRemoteStateCache.ts`:

```ts
import { deserialize, serialize } from 'domain-objects';
import { asHashSha256 } from 'hash-fns';
import type { SimpleOnDiskCache } from 'simple-on-disk-cache';
import { createRemoteStateCacheContext } from 'with-remote-state-cache';

import type { AgentContext } from '@src/domain.objects/AgentContext';
import { DeclaredEntity1 } from '@src/domain.objects/DeclaredEntity1';
// ... import all declared entities

/**
 * .what = extract context from input tuple
 * .why = withRemoteStateQueryCache signature is [input, context]
 */
const asContextFromInputTuple = ([, context]: [any, AgentContext]): AgentContext =>
  context;

/**
 * .what = extract cache from agent context
 * .why = navigate nested path with clear intent
 */
const asCacheFromContext = (context: AgentContext) =>
  context.agentOptions.remoteState.cache;

/**
 * .what = extract cache from input tuple
 * .why = compose extractors for tuple-to-cache path
 */
const asCacheFromInput = (fromInput: [any, AgentContext]) =>
  asCacheFromContext(asContextFromInputTuple(fromInput));

/**
 * .what = compute account namespace (first 12 chars of email hash)
 * .why = creates unique but short namespace for cache isolation
 */
const asAccountNamespace = (email: string) =>
  asHashSha256(email).slice(0, 12);

/**
 * .what = replace structure chars with underscores
 * .why = first step of input sanitization
 */
const asStructureCharsReplaced = (str: string) =>
  str.replace(/[{}[\]:,]/gi, '_');

/**
 * .what = remove non-alphanumeric chars except underscore
 * .why = second step of input sanitization
 */
const asAlphanumericOnly = (str: string) =>
  str.replace(/[^0-9a-z_]/gi, '');

/**
 * .what = collapse multiple underscores to single
 * .why = third step of input sanitization
 */
const asUnderscoresCollapsed = (str: string) =>
  str.replace(/__+/g, '_');

/**
 * .what = take first 100 characters
 * .why = limit length for filesystem compatibility
 */
const asFirst100Chars = (str: string) => str.slice(0, 100);

/**
 * .what = remove underscore from start
 * .why = clean prefix separator
 */
const asStartUnderscoreRemoved = (str: string) => str.replace(/^_/, '');

/**
 * .what = remove underscore from end
 * .why = clean suffix separator
 */
const asEndUnderscoreRemoved = (str: string) => str.replace(/_$/, '');

/**
 * .what = trim start/end underscores and limit length
 * .why = final cleanup for cache key readability
 */
const asTrimmedAndLimited = (str: string) => {
  const limited = asFirst100Chars(str);
  const startTrimmed = asStartUnderscoreRemoved(limited);
  const fullyTrimmed = asEndUnderscoreRemoved(startTrimmed);
  return fullyTrimmed;
};

/**
 * .what = compute sanitized input preview for observability
 * .why = compose sanitization steps for readable cache key segment
 */
const asInputPreview = (input: any) => {
  const serialized = JSON.stringify(input);
  const structureReplaced = asStructureCharsReplaced(serialized);
  const alphanumeric = asAlphanumericOnly(structureReplaced);
  const collapsed = asUnderscoresCollapsed(alphanumeric);
  return asTrimmedAndLimited(collapsed);
};

// named transformer: join segments with dot separator
const asJoinedWithDot = (segments: string[]) => segments.join('.');

// named transformer: compute cache key from input and context
const asCacheKey = (input: any, context: AgentContext) => {
  const accountSegment = asAccountNamespace(context.agentOptions.account.email);
  const previewSegment = asInputPreview(input);
  const hashSegment = asHashSha256(JSON.stringify(input));
  const versionSegment = 'v1';
  return asJoinedWithDot([accountSegment, previewSegment, hashSegment, versionSegment]);
};

const remoteStateCacheContext = createRemoteStateCacheContext<
  [any, AgentContext],
  SimpleOnDiskCache
>({
  cache: ({ fromInput }) => asCacheFromInput(fromInput),

  serialize: {
    key: asCacheKey,
    value: (output) => serialize(output, { lossless: true }),
  },

  deserialize: {
    value: (cached) => {
      return deserialize(cached, {
        with: [
          DeclaredEntity1,
          // ... all declared entities
        ],
      });
    },
  },
});

export const withRemoteStateQueryCache: any =
  remoteStateCacheContext.withRemoteStateQueryCache;

export const withRemoteStateMutationRegistration: any =
  remoteStateCacheContext.withRemoteStateMutationRegistration;
```

### 2. wrap get* operations

```ts
import { withRemoteStateQueryCache } from '../../infra/performance/withRemoteStateCache';

const {
  execute: getAllDomainsWithCache,
  addTrigger: addTriggerToGetAllDomains,
} = withRemoteStateQueryCache(
  withNewLoggedInBrowserPage(getAllDomainsFromPage),
  { name: 'getAllDomains' },
);

export const getAllDomains = getAllDomainsWithCache;
export { addTriggerToGetAllDomains };
```

### 3. wrap set* operations with invalidation

```ts
import { withRemoteStateMutationRegistration } from '../../infra/performance/withRemoteStateCache';
import { addTriggerToGetAllDomains } from './getAllDomains';

const setDomainMutation = withRemoteStateMutationRegistration(
  setDomainWithPage,
  { name: { override: 'setDomain' } },
);

// named transformer: extract domain name from mutation input
const asDomainNameFromMutationInput = (mutationInput: any) =>
  mutationInput.findsert?.domain?.name ?? mutationInput.upsert?.domain?.name;

// named transformer: convert domain name to cache key segment
const asCacheKeySegment = (domainName: string) =>
  domainName.replace(/\./g, '_');

// named transformer: filter cache keys affected by domain mutation
const asKeysToInvalidateForDomain = (
  cachedQueryKeys: string[],
  domainName: string,
) => cachedQueryKeys.filter((key) => key.includes(asCacheKeySegment(domainName)));

// register invalidation trigger
addTriggerToGetAllDomains({
  invalidatedBy: {
    mutation: setDomainMutation,
    affects: ({ cachedQueryKeys, mutationInput }) => {
      const domainName = asDomainNameFromMutationInput(mutationInput);
      if (!domainName) return { keys: [] };
      const keysToInvalidate = asKeysToInvalidateForDomain(cachedQueryKeys, domainName);
      return { keys: keysToInvalidate };
    },
  },
});

export const setDomain = setDomainMutation.execute;
```

## .cache location

```
.cache/{app-name}/
```

clear with: `rm -rf .cache/{app-name}` to force fresh scrape.

## .cache management skills

use cache skills to manage per-account cache:

```bash
# expire (delete) cache for account
rhx cache.expire --for user@example.com --cache-dir .cache/myapp

# extend cache ttl by 24 hours
rhx cache.extend --for user@example.com --by PT24H --cache-dir .cache/myapp
```

## .best practices

1. **namespace by account** — hash email to first 12 chars for cache isolation
2. **include input preview** — make cache keys observable for debug
3. **version cache keys** — bump `v1` suffix on schema changes
4. **targeted invalidation** — invalidate only affected cache entries, not all
5. **serialize losslessly** — use `serialize(output, { lossless: true })` for domain objects

## .see also

- rule.require.remote-state-cache.md — the requirement
- ref.remote-state-query-cache.md — package reference
