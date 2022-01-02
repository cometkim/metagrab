import type { OpenGraphManifest } from './opengraph';

export type TwitterCardManifest = Pick<OpenGraphManifest, 'title' | 'description' | 'images'> & {
  site?: string,
  creator?: string,
};
