import { getRedisClient } from "./client";
import type { CacheKeyBuilder, CacheOptions } from "./types";

const DEFAULT_SERIALIZE = (value: unknown): string => JSON.stringify(value);
const DEFAULT_DESERIALIZE = <T>(value: string): T => JSON.parse(value) as T;

export function cached<T extends unknown[], R>(
  options: CacheOptions,
  keyBuilder: CacheKeyBuilder<T>
) {
  return function (
    target: unknown,
    propertyName: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const originalMethod = descriptor.value as (...args: T) => Promise<R>;

    descriptor.value = async function (...args: T): Promise<R> {
      const redis = getRedisClient();
      if (!redis) {
        // If Redis is not available, execute without caching
        return originalMethod.apply(this, args);
      }

      const serialize = options.serialize ?? DEFAULT_SERIALIZE;
      const deserialize = options.deserialize ?? DEFAULT_DESERIALIZE;
      const prefix = options.keyPrefix ?? "cache";
      const cacheKey = `${prefix}:${keyBuilder(...args)}`;

      try {
        // Try to get from cache
        const cachedValue = await redis.get(cacheKey);
        if (cachedValue !== null) {
          return deserialize<R>(cachedValue);
        }

        // Execute original method
        const result = await originalMethod.apply(this, args);

        // Store in cache
        const serialized = serialize(result);
        await redis.setex(cacheKey, options.ttlSeconds, serialized);

        return result;
      } catch (error) {
        // On cache error, fall back to original method
        console.error(`[Cache] Error for key ${cacheKey}:`, error);
        return originalMethod.apply(this, args);
      }
    };

    return descriptor;
  };
}

export function invalidateCache(pattern: string): Promise<void> {
  return new Promise(async (resolve) => {
    const redis = getRedisClient();
    if (!redis) {
      resolve();
      return;
    }

    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      resolve();
    } catch (error) {
      console.error(`[Cache] Error invalidating pattern ${pattern}:`, error);
      resolve();
    }
  });
}

export async function getCache<T>(
  key: string,
  options?: { deserialize?: (value: string) => T }
): Promise<T | null> {
  const redis = getRedisClient();
  if (!redis) {
    return null;
  }

  try {
    const value = await redis.get(key);
    if (value === null) {
      return null;
    }

    const deserialize = options?.deserialize ?? DEFAULT_DESERIALIZE;
    return deserialize<T>(value);
  } catch (error) {
    console.error(`[Cache] Error getting key ${key}:`, error);
    return null;
  }
}

export async function setCache(
  key: string,
  value: unknown,
  ttlSeconds: number,
  options?: { serialize?: (value: unknown) => string }
): Promise<void> {
  const redis = getRedisClient();
  if (!redis) {
    return;
  }

  try {
    const serialize = options?.serialize ?? DEFAULT_SERIALIZE;
    const serialized = serialize(value);
    await redis.setex(key, ttlSeconds, serialized);
  } catch (error) {
    console.error(`[Cache] Error setting key ${key}:`, error);
  }
}
