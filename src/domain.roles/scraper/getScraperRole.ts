import { Role } from 'rhachet';

/**
 * .what = returns the scraper role definition
 * .why = enables rhachet to enroll brains with cache capabilities for browser scrapes
 */
export const ROLE_SCRAPER: Role = Role.build({
  slug: 'scraper',
  name: 'Scraper',
  purpose: 'cache browser scrapes and manage cache lifecycle',
  traits: [],
  readme: { uri: `${__dirname}/readme.md` },
  boot: { uri: `${__dirname}/boot.yml` },
  briefs: {
    dirs: [{ uri: `${__dirname}/briefs` }],
  },
  skills: {
    dirs: [{ uri: `${__dirname}/skills` }],
    refs: [],
  },
  hooks: {
    onBrain: {
      onBoot: [
        {
          command:
            './node_modules/.bin/rhachet roles boot --repo bhrowser --role scraper',
          timeout: 'PT60S',
        },
      ],
    },
  },
});
