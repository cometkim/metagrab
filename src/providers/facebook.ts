import type { OpenGraphManifest } from './opengraph';

export type FacebookManifest = OpenGraphManifest & {
  appId: string,
};
