import express from "express";
import helmet from "helmet";
import cors from "cors";
import { pinoHttp } from "pino-http";
import rateLimit from "express-rate-limit";
import { logger } from "./config/logger.js";
import { env } from "./config/env.js";
import { authenticate } from "./middleware/auth.middleware.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { errorHandler } from "./middleware/error-handler.js";
import { getCurrentUser } from "./modules/users/user.controller.js";
import { deleteCurrentAccount } from "./modules/users/account-deletion.controller.js";
import vaultRoutes from "./modules/vaults/vault.routes.js";
import shareAccessRoutes from "./modules/shares/share-access.routes.js";
import accessRequestRoutes from "./modules/shares/access-request.routes.js";
import sharedFileRoutes from "./modules/files/shared-file.routes.js";
import folderRoutes from "./modules/folders/folder.routes.js";
import { auditRequest } from "./middleware/audit.middleware.js";
import { logoutController } from "./modules/users/auth-session.controller.js";
import { requireProvisionedUser } from "./middleware/require-provisioned-user.js";
import { listOwnAuditEventsController } from "./modules/audit/audit-history.controller.js";

const app = express();
app.disable("x-powered-by");
if (env.TRUST_PROXY_HOPS > 0) app.set("trust proxy", env.TRUST_PROXY_HOPS);

app.use(helmet(env.NODE_ENV === "production" ? {} : { hsts: false }));
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || env.CORS_ORIGINS.includes(origin)) callback(null, true);
        else callback(null, false);
    },
}));
app.use(pinoHttp({ logger }));
app.use(auditRequest);

const apiRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { success: false, error: { code: "RATE_LIMITED", message: "Too many requests. Please try again later." } },
});
app.use("/api/v1", apiRateLimiter);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

app.get("/health", (_req, res) => res.status(200).json({
    success: true, data: { status: "healthy", service: "VaultShare API" },
}));
app.get("/api/v1/auth/me", authenticate, getCurrentUser);
app.post("/api/v1/auth/logout", authenticate, logoutController);
app.delete("/api/v1/users/me", authenticate, deleteCurrentAccount);
app.get("/api/v1/audit-events", authenticate, requireProvisionedUser, listOwnAuditEventsController);
app.use("/api/v1/vaults", vaultRoutes);
app.use("/api/v1/folders", folderRoutes);
app.use("/api/v1/shares", shareAccessRoutes);
app.use("/api/v1/shares", sharedFileRoutes);
app.use("/api/v1/access-requests", accessRequestRoutes);
app.use(notFoundHandler);
app.use(errorHandler);
export default app;
