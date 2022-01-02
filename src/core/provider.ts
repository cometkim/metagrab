export type Manifest = Record<string, unknown>;

export interface Collector {
  (absoluteUrl: URL): Promise<Manifest>;
}

export interface Validator<ProviderManifest extends Manifest> {
  (manifestLike: Manifest): manifestLike is ProviderManifest;
}

export interface ImageGetter<ProviderManifest extends Manifest> {
  (
    manifest: ProviderManifest,
    props: {
      // :thinking:
      preferFormat: string,
      preferSize: string,
    },
  ): URL | null;
}

export type Provider<Name extends string, ProviderManifest extends Manifest = Manifest> = {
  name: Name,
  getCacheKey: (url: URL) => string,
  getImage: ImageGetter<ProviderManifest>,
  validate: Validator<ProviderManifest>,
  collector: Collector,
}

export class ProviderError extends Error {
  constructor(provider: Provider<string, any>) {
    const message = `provider(${provider.name}): TODO`;
    super(message);
  }
}
