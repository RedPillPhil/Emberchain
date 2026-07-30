import pino from "pino";
import { daemonConfig } from "./config.js";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: daemonConfig.logLevel,
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
