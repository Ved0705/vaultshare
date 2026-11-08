import pino from "pino";
import { env } from "./env.js";

export const sensitiveLogRedactionPaths = [
    "req.headers.authorization", "req.headers.cookie", "req.url", "req.originalUrl",
    "req.params.shareCode", "res.headers.set-cookie", "password", "passphrase",
    "token", "accessToken", "refreshToken", "secret", "dek", "kek",
] as const;

export const logger = pino({
    level: env.NODE_ENV === "development" ? "debug" : "info",
    redact: { paths: [...sensitiveLogRedactionPaths], censor: "[REDACTED]" },
    timestamp: pino.stdTimeFunctions.isoTime,
});
