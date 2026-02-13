export type CacheOptions = {
  ttlSeconds: number;
  keyPrefix?: string;
  serialize?: (value: unknown) => string;
  deserialize?: (value: string) => unknown;
};

export type CacheKeyBuilder<T extends unknown[]> = (...args: T) => string;
