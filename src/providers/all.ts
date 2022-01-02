import type { Provider } from '../core/provider';

import type { SiteManifest } from './site';
import type { OpenGraphManifest } from './opengraph';
import type { FacebookManifest } from './facebook';
import type { TwitterCardManifest } from './twitter';

export type AllManifest = (
  & SiteManifest
  & { opengraph: OpenGraphManifest }
  & { facebook: FacebookManifest }
  & { twitter: TwitterCardManifest }
);
