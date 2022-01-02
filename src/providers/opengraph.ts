/// <reference types="@cloudflare/workers-types" />

import type { Provider } from '../core/provider';
import { limitedBytesStreamReaderIterator, ensureTrailingSlash } from './../core/utils';

export type OpenGraphManifest = {
  type?: string,
  title?: string,
  description?: string,
  url?: string,
  siteName?: string,
  locale?: string,
  alternateLocales?: string[],
  determiner?: string,
  images?: OpenGraphImage[],
}

export type OpenGraphImage = {
  url: string,
  type?: string,
  alt?: string,
  width?: number,
  height?: number,
};

type CollectorContext = {
  type?: string,
  title?: string,
  description?: string,
  url?: string,
  determiner?: string,
  siteName?: string,
  locale?: string,
  alternateLocales: string[],
  images: OpenGraphImage[],
};

export const openGraphProvider: Provider<'opengraph', OpenGraphManifest> = {
  name: 'opengraph',

  getCacheKey(url) {
    return `${this.name}:${url.toString()}`;
  },

  getImage(manifest) {
    if (manifest.images) {
      return new URL(manifest.images[0].url);
    }
    return null;
  },

  // FIXME
  validate(manifestLike): manifestLike is OpenGraphManifest {
    return false;
  },

  async collector(url) {
    const baseUrl = ensureTrailingSlash(url).toString();

    let context: CollectorContext = {
      images: [],
      alternateLocales: [],
    };

    try {
      const handler = new OpenGraphCollector(context);
      const transformer = new HTMLRewriter()
        .on('meta[property^=og][content]', handler);
      let target = await fetch(baseUrl);
      const collectorStream = transformer.transform(target).body;
      if (!collectorStream) {
        throw void 0;
      }
      for await (let _chunk of limitedBytesStreamReaderIterator(collectorStream, 100_000)) {
        // noop
      }
      handler.flushImage();
    } catch {
      throw new Error(`Failed to fetch ${baseUrl}`);
    }

    let ogUrl = context.url;
    if (!ogUrl) {
      throw new Error(`Couldn't found og:url from ${baseUrl}`);
    }
    try {
      ogUrl = ensureTrailingSlash(new URL(ogUrl)).toString();
    } catch {
      throw new Error(`Invalid og:url found from ${baseUrl}`);
    }

    if (baseUrl !== ogUrl) {
      const ogContext = {
        images: [],
        alternateLocales: [],
      };
      const handler = new OpenGraphCollector(ogContext);
      const transformer = new HTMLRewriter()
        .on('meta[property^=og][content]', handler);
      try {
        let target = await fetch(ogUrl);
        const collectorStream = transformer.transform(target).body;
        if (!collectorStream) {
          throw void 0;
        }
        for await (let _chunk of limitedBytesStreamReaderIterator(collectorStream, 100_000)) {
          // noop
        }
        handler.flushImage();
      } catch {
        throw new Error(`Failed to fetch ${ogUrl}`);
      }
      context = ogContext;
    }

    if (!context.url) {
      throw new Error(`Couldn't found og:url from ${ogUrl}`);
    }
    try {
      ogUrl = ensureTrailingSlash(new URL(context.url)).toString();
    } catch {
      throw new Error(`Invalid og:url found from ${ogUrl}`);
    }

    return {
      type: context.type,
      title: context.title,
      description: context.description,
      url: ogUrl,
      siteName: context.siteName,
      locale: context.locale,
      alternateLocales: context.alternateLocales.length > 0
        ? context.alternateLocales
        : undefined,
      images: context.images.length > 0
        ? context.images
        : undefined,
    };
  },
};

type OpenGraphCollectorState = (
  | { type: 'IDLE' }
  | { type: 'IMAGE_OPEN', image: OpenGraphImage }
);

class OpenGraphCollector {
  #state: OpenGraphCollectorState = { type: 'IDLE' };
  #context: CollectorContext;

  constructor(context: CollectorContext) {
    this.#context = context;
  }

  element(element: Element) {
    if (element.tagName.toLowerCase() !== 'meta') {
      return;
    }
    const property = element.getAttribute('property');
    const content = element.getAttribute('content');
    if (!property?.startsWith('og:')) {
      return;
    }
    if (!content) {
      return;
    }

    const [_og, namespace, key] = property.split(':');
    if (namespace === 'url') {
      this.#context.url = content;
    }
    if (namespace === 'determiner') {
      this.#context.determiner = content;
    }
    if (namespace === 'site_name') {
      this.#context.siteName = content;
    }
    if (namespace === 'title') {
      this.#context.title = content;
    }
    if (namespace === 'description') {
      this.#context.description = content;
    }
    if (namespace === 'locale' && !key) {
      this.#context.locale = content;
    }
    if (namespace === 'locale' && key === 'alternate') {
      this.#context.alternateLocales.push(content);
    }

    if (namespace === 'image' && (!key || key === 'url')) {
      switch (this.#state.type) {
        case 'IDLE': {
          this.#openImage({ url: content });
          break;
        }
        case 'IMAGE_OPEN': {
          this.flushImage();
          break;
        }
      }
    } else if (namespace === 'image' && (key && this.#state.type === 'IMAGE_OPEN')) {
      switch (key) {
        case 'url': {
          this.#state.image.url = content;
          break;
        }
        case 'type': {
          this.#state.image.type = content;
          break;
        }
        case 'alt': {
          this.#state.image.alt = content;
          break;
        }
        case 'width': {
          this.#state.image.width = +content;
          break;
        }
        case 'height': {
          this.#state.image.height = +content;
          break;
        }
      }
    }
  }

  #openImage(image: OpenGraphImage) {
    if (this.#state.type === 'IDLE') {
      this.#state = { type: 'IMAGE_OPEN', image };
    }
  }

  flushImage() {
    if (this.#state.type === 'IMAGE_OPEN') {
      this.#context.images.push(this.#state.image);
      this.#state = { type: 'IDLE' };
    }
  }
}
