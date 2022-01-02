import { Router } from 'worktop';
import * as CORS from 'worktop/cors';
import * as Cache from 'worktop/cache';
import type { KV } from 'worktop/kv';

import type { Provider, Manifest } from './core/provider';
import { siteProvider } from './providers/site';
import { openGraphProvider } from './providers/opengraph';

declare var MANIFEST: KV.Namespace;

// declare var IMAGE: KV.Namespace;

const providers: Record<string, Provider<string, any>> = {
  site: siteProvider,
  opengraph: openGraphProvider,
};

const API = new Router();

API.prepare = CORS.preflight();

API.add('GET', '/:provider/manifest', async (req, res) => {
  const { provider: providerName } = req.params;
  const search = new URLSearchParams(req.search);

  try {
    const urlString = search.get('url');
    if (!urlString) {
      return res.send(400, 'Paramater "url" is required');
    }
    var url = new URL(decodeURIComponent(urlString));
  } catch {
    return res.send(400, 'Invalid URL');
  }

  const provider = providers[providerName];
  if (!provider) {
    return res.send(400, `Unknown provider ${providerName}`);
  }

  const cacheKey = provider.getCacheKey(url);
  const cache = await MANIFEST.get<Manifest>(cacheKey, 'json');
  if (cache) {
    res.setHeader('Cache-Control', `public, max-age=${60 * 60 * 24}`);
    return res.send(200, cache);
  }

  try {
    var manifest = await provider.collector(url);
  } catch (e) {
    return res.send(500, 'Failed to collect manifest, e: TODO');
  }

  // TODO: validate manifest
  // provider.validate(manifest) { ... }

  await MANIFEST.put(cacheKey, JSON.stringify(manifest));

  res.setHeader('Cache-Control', `public, max-age=${60 * 60 * 24}`);
  return res.send(200, manifest);
});

API.add('GET', '/:provider/image', async (req, res) => {
  // TODO
});

API.add('POST', '/:provider/invalidate', async (req, res) => {
  // TODO
});

Cache.listen(API.run);
