import { RoleRegistry } from 'rhachet';

import { ROLE_INSPECTOR } from './inspector/getInspectorRole';
import { ROLE_PLAYWRIGHT } from './playwright/getPlaywrightRole';

/**
 * .what = returns the bhrowser registry of predefined roles
 * .why = enables rhachet to discover and enroll bhrowser roles
 */
export const getRoleRegistry = (): RoleRegistry =>
  RoleRegistry.build({
    slug: 'bhrowser',
    readme: { uri: `${__dirname}/readme.md` },
    roles: [ROLE_PLAYWRIGHT, ROLE_INSPECTOR],
  });
