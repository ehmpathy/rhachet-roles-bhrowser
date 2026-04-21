import { Role } from 'rhachet';

/**
 * .what = returns the inspector role definition
 * .why = enables rhachet to enroll brains with inspector capabilities
 */
export const ROLE_INSPECTOR: Role = Role.build({
  slug: 'inspector',
  name: 'Inspector',
  purpose: 'inspect browser renders for performance, precision, and aesthetics',
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
            './node_modules/.bin/rhachet roles boot --repo bhrowser --role inspector',
          timeout: 'PT60S',
        },
      ],
    },
  },
});
