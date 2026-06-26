# ref.remote-state-query-cache

## .what

reference for `with-remote-state-cache` npm package.

## .package

- npm: https://www.npmjs.com/package/with-remote-state-cache
- repo: https://github.com/ehmpathy/with-remote-state-cache

## .summary

declarative remote state cache with:
- query cache wrapper (`withRemoteStateQueryCache`)
- mutation registration (`withRemoteStateMutationRegistration`)
- automatic invalidation triggers
- configurable serialize/deserialize

## .cache expiration

default: 24 hours (configured in `simple-on-disk-cache`)

custom ttl:
```ts
import { SimpleOnDiskCache } from 'simple-on-disk-cache';

const cache = new SimpleOnDiskCache({
  directory: '.cache/myapp',
  defaultExpirationMs: 1000 * 60 * 60 * 24, // 24h
});
```

## .related packages

- `simple-on-disk-cache` — on-disk cache storage
- `domain-objects` — serialize/deserialize domain objects
- `hash-fns` — hash cache keys

## .see also

- rule.require.remote-state-cache.md — the requirement
- howto.cache-browser-scrapes.md — practical guide
