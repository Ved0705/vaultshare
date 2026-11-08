import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { requireProvisionedUser } from "../../middleware/require-provisioned-user.js";
import { passphraseRateLimiter, fileOperationRateLimiter } from "../../middleware/security-rate-limit.js";
import { openShareController } from "./share-access.controller.js";
import { createWriteRequestController } from "./write-request.controller.js";

const router = Router();
router.use(authenticate, requireProvisionedUser);
router.post("/:shareCode/open", passphraseRateLimiter, openShareController);
router.post("/:shareCode/write-requests", fileOperationRateLimiter, createWriteRequestController);
export default router;
