import { Router } from "express";
import shareRoutes from "../shares/share.routes.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { requireProvisionedUser } from "../../middleware/require-provisioned-user.js";
import { reviewWriteRequestController } from "../shares/write-request-review.controller.js";
import {
    createVaultController,
    listVaultsController,
    getVaultController,
    updateVaultController,
} from "./vault.controller.js";
import { listWriteRequestsController } from "../shares/write-request-list.controller.js";
import { getWriteRequestDetailController } from "../shares/write-request-detail.controller.js";

const router = Router();

// Every vault endpoint requires a valid Cognito token
// and a provisioned, verified database user.
router.use(authenticate, requireProvisionedUser);
router.use("/:id/shares", shareRoutes);
router.post("/", createVaultController);
router.get("/", listVaultsController);
router.get("/:id", getVaultController);
router.patch("/:id", updateVaultController);
router.post(
    "/:id/write-requests/:requestId/review",
    reviewWriteRequestController,
);
router.get(
    "/:id/write-requests/:requestId",
    getWriteRequestDetailController,
);
router.get("/:id/write-requests", listWriteRequestsController);
export default router;