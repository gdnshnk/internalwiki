import pino from "pino";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

const isDevelopment = process.env.NODE_ENV === "development";
const logLevel = (process.env.LOG_LEVEL ?? (isDevelopment ? "debug" : "info")) as LogLevel;

export const logger = pino({
  level: logLevel,
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    }
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isDevelopment
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss Z",
            ignore: "pid,hostname"
          }
        }
      }
    : {
        // Production: structured JSON logs
        serializers: {
          req: pino.stdSerializers.req,
          res: pino.stdSerializers.res,
          err: pino.stdSerializers.err
        }
      })
});

export function createLogger(context?: Record<string, unknown>): typeof logger {
  if (!context) {
    return logger;
  }

  return logger.child(context);
}

export function createRequestLogger(requestId: string, additionalContext?: Record<string, unknown>): typeof logger {
  return logger.child({
    requestId,
    ...additionalContext
  });
}
