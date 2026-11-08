import { Router } from "express";

import { authenticate } from "../../middleware/auth.middleware.js";
import { requireProvisionedUser } from "../../middleware/require-provisioned-user.js";
import { fileOperationRateLimiter } from "../../middleware/security-rate-limit.js";

import {
    listSharedFilesController,
    downloadSharedFileController,
} from "./shared-file.controller.js";

const router = Router();

router.use(authenticate, requireProvisionedUser);

router.post(
    "/:shareCode/files/list", fileOperationRateLimiter,
    listSharedFilesController,
);

router.post(
    "/:shareCode/files/:fileId/download", fileOperationRateLimiter,
    downloadSharedFileController,
);

export default router;