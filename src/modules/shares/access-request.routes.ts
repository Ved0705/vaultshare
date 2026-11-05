import { cancelAccessRequestController } from "./access-request-cancel.controller.js";
import { Router } from "express";

import { authenticate } from "../../middleware/auth.middleware.js";
import { requireProvisionedUser } from "../../middleware/require-provisioned-user.js";
import { createAccessRequestController } from "./access-request.controller.js";

const router = Router();

router.use(authenticate, requireProvisionedUser);

router.post(
    "/vaults/:vaultId",
    createAccessRequestController,

);
router.patch(
    "/:requestId/cancel",
    cancelAccessRequestController,
);

export default router;
