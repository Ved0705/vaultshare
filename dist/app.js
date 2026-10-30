import { notFoundHandler } from "./middleware/not-found.js";
import { errorHandler } from "./middleware/error-handler.js";
import { logger } from "./config/logger.js";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import { pinoHttp } from "pino-http";
const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(pinoHttp({ logger }));
app.get("/health", (_req, res) => {
    res.status(200).json({
        success: true,
        data: {
            status: "healthy",
            service: "VaultShare API",
        },
    });
});
export default app;
app.use(notFoundHandler);
app.use(errorHandler);
//# sourceMappingURL=app.js.map