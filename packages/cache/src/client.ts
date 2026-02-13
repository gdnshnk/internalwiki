import Redis from "ioredis";

let redisClient: Redis | null = null;

export function getRedisClient(): Redis | null {
  if (redisClient) {
    return redisClient;
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    // Redis is optional - return null if not configured
    return null;
  }

  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      enableReadyCheck: true,
      lazyConnect: false
    });

    redisClient.on("error", (error) => {
      console.error("[Redis] Connection error:", error);
    });

    redisClient.on("connect", () => {
      console.log("[Redis] Connected");
    });

    return redisClient;
  } catch (error) {
    console.error("[Redis] Failed to initialize:", error);
    return null;
  }
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
