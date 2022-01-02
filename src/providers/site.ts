/// <reference types="@cloudflare/workers-types" />

import type { Provider } from '../core/provider';
import { toAbsoluteUrl, limitedBytesStreamReaderIterator } from '../core/utils';

export type SiteManifest = {
  homepage: string,
  icons: Icon[],
  manifest?: WebappManifest,
};

type Icon = {
  src: string,
  sizes?: string,
  type?: string,
};

type WebappManifest = {
  icons?: Icon[],
};

type CollectorContext = {
  baseUrl: string,
  icons: Icon[],
  manifest?: WebappManifest,
};

export const siteProvider: Provider<'site', SiteManifest> = {
  name: 'site',

  getCacheKey(url) {
    return `${this.name}:${url.host}`;
  },

  getImage: () => null,

  // FIXME
  validate(manifestLike): manifestLike is SiteManifest {
    return false;
  },

  async collector(url) {
    const homepage = `https://${url.host}/`;
    const context: CollectorContext = {
      baseUrl: homepage,
      icons: [],
    };
    try {
      let target = await fetch(homepage);
      let linkedIconCollector = new LinkedIconCollector(context);
      let manifestIconCollector = new WebappManifestCollector(context);
      let transformer = new HTMLRewriter()
        .on('link[rel="icon"]', linkedIconCollector)
        .on('link[rel="shortcut icon"]', linkedIconCollector)
        .on('link[rel="mask-icon"]', linkedIconCollector)
        .on('link[rel="apple-touch-icon"]', linkedIconCollector)
        .on('link[rel="apple-touch-icon-precomposed"]', linkedIconCollector)
        .on('link[rel="manifest"]', manifestIconCollector)
        ;
      let collectorStream = transformer.transform(target).body;
      if (!collectorStream) {
        throw void 0;
      }
      for await (let _chunk of limitedBytesStreamReaderIterator(collectorStream, 100_000)) {
        // noop
      }
    } catch {
      throw new Error(`Failed to fetch ${homepage}`);
    }

    return {
      homepage,
      icons: context.icons,
      manifest: context.manifest,
    };
  },
}

class LinkedIconCollector {
  #baseUrl: string;
  #context: CollectorContext;

  constructor(context: CollectorContext) {
    this.#baseUrl = context.baseUrl;
    this.#context = context;
  }

  element(element: Element) {
    let src = element.getAttribute('href');
    if (!src) {
      return;
    }
    src = toAbsoluteUrl(src, this.#baseUrl);
    let sizes = element.getAttribute('sizes');
    let type = element.getAttribute('type');
    this.#context.icons.push({
      src,
      ...sizes && { sizes },
      ...type && { type },
    });
  }
}

class WebappManifestCollector {
  #baseUrl: string;
  #context: CollectorContext;

  constructor(context: CollectorContext) {
    this.#baseUrl = context.baseUrl;
    this.#context = context;
  }

  async element(element: Element) {
    let src = element.getAttribute('href');
    if (!src) {
      return;
    }

    let manifestUrl = toAbsoluteUrl(src, this.#context.baseUrl);
    try {
      const manifestResponse = await fetch(manifestUrl, {
        headers: {
          'Accept': 'application/manifest+json',
        },
      });

      let manifest = await manifestResponse.json() as WebappManifest;
      this.#context.manifest = manifest;

      if (!manifest.icons) {
        return;
      }

      for (let iconLike of manifest.icons) {
        if (!iconLike.src) {
          continue;
        }
        let { src, sizes, type } = iconLike;
        this.#context.icons.push({
          src: toAbsoluteUrl(src, this.#baseUrl),
          ...sizes && { sizes },
          ...type && { type },
        });
      }
    } catch {
      // noop
    }
  }
}
