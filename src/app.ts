import express from "express";
import helmet from "helmet";
import cors from "cors";
import { pinoHttp } from "pino-http";
import { logger } from "./config/logger.js";
import { authenticate } from "./middleware/auth.middleware.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { errorHandler } from "./middleware/error-handler.js";
import { getCurrentUser } from "./modules/users/user.controller.js";
import vaultRoutes from "./modules/vaults/vault.routes.js";
import shareAccessRoutes from "./modules/shares/share-access.routes.js";

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

app.get("/api/v1/auth/me", authenticate, getCurrentUser);
app.use("/api/v1/vaults", vaultRoutes);
app.use("/api/v1/shares", shareAccessRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
