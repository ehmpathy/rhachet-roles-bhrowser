# rule.require.remote-state-cache

## .what

all get* operations that scrape remote state MUST be wrapped with `withRemoteStateQueryCache`.

## .why

browser scrapes are expensive:
- take 5-30 seconds per page
- risk rate limits and bot detection
- require authenticated browser session
- navigate through spa apps (slow initial render)

without cache:
- declastruct plan runs take 10+ minutes for large datasets
- repeated plans re-scrape all data
- bot detection triggers increase with request volume

with cache:
- first run scrapes, subsequent runs are instant
- 24-hour expiration balances freshness vs performance
- mutations invalidate relevant cache entries

## .pattern

### step 1: wrap get* with cache

```ts
// in get{Entity}.ts
import { withRemoteStateQueryCache } from '../../infra/performance/withRemoteStateCache';

const {
  execute: get{Entity}WithCache,
  addTrigger: addTriggerToGet{Entity},
} = withRemoteStateQueryCache(
  withNewLoggedInBrowserPage(get{Entity}FromPage),
  { name: 'get{Entity}' },
);

export const get{Entity} = get{Entity}WithCache;
export { addTriggerToGet{Entity} };
```

### step 2: wrap set* with mutation registration

mutations must:
1. wrap with `withRemoteStateMutationRegistration`
2. register triggers to invalidate related caches

```ts
// in set{Entity}.ts
import { withRemoteStateMutationRegistration } from '../../infra/performance/withRemoteStateCache';
import { addTriggerToGet{Entity} } from './get{Entity}';

// wrap mutation
const set{Entity}Mutation = withRemoteStateMutationRegistration(
  set{Entity}WithPage,
  { name: { override: 'set{Entity}' } },
);

// named transformer: filter cache keys affected by mutation
const asKeysToInvalidateForMutation = (
  cachedQueryKeys: string[],
  relevantIdentifier: string,
) => cachedQueryKeys.filter((key) => key.includes(relevantIdentifier));

// register cache invalidation trigger
addTriggerToGet{Entity}({
  invalidatedBy: {
    mutation: set{Entity}Mutation,
    affects: ({ cachedQueryKeys, mutationInput }) => {
      const keysToInvalidate = asKeysToInvalidateForMutation(
        cachedQueryKeys,
        relevantIdentifier,
      );
      return { keys: keysToInvalidate };
    },
  },
});

export const set{Entity} = set{Entity}Mutation.execute;
```

### step 3: register domain object for deserialization

add new domain objects to the deserialize list:

```ts
deserialize: {
  value: (cached) => {
    return deserialize(cached, {
      with: [
        Declared{Entity},  // add new types here
        // ...
      ],
    });
  },
},
```

## .cache key format

cache keys include:
1. account namespace (email hash, first 12 chars)
2. preview of input (sanitized for observability)
3. unique hash suffix
4. version suffix (bump on schema changes)

example: `a1b2c3d4e5f6.domain_name_example_com.abc123...def456.v1`

## .enforcement

get* operation without `withRemoteStateQueryCache` = blocker

## .see also

- ref.remote-state-query-cache.md — cache package details
- howto.cache-browser-scrapes.md — practical guide
