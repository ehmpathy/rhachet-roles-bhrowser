import { Role } from 'rhachet';

/**
 * .what = returns the playwright role definition
 * .why = enables rhachet to enroll brains with playwright capabilities
 */
export const ROLE_PLAYWRIGHT: Role = Role.build({
  slug: 'playwright',
  name: 'Playwright',
  purpose: 'compose repeatable playbooks that drive browsers through workflows',
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
            './node_modules/.bin/rhachet roles boot --repo bhrowser --role playwright',
          timeout: 'PT60S',
        },
      ],
    },
  },
});
