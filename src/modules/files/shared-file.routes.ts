import { Router } from "express";

import { authenticate } from "../../middleware/auth.middleware.js";
import { requireProvisionedUser } from "../../middleware/require-provisioned-user.js";

import {
    listSharedFilesController,
    downloadSharedFileController,
} from "./shared-file.controller.js";

const router = Router();

router.use(authenticate, requireProvisionedUser);

router.post(
    "/:shareCode/files/list",
    listSharedFilesController,
);

router.post(
    "/:shareCode/files/:fileId/download",
    downloadSharedFileController,
);

export default router;