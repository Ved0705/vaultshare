import { Router } from "express";
import shareRoutes from "../shares/share.routes.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { requireProvisionedUser } from "../../middleware/require-provisioned-user.js";
import { reviewWriteRequestController } from "../shares/write-request-review.controller.js";
import shareRevocationRoutes from "../shares/share-revocation.routes.js";
import accessRequestOwnerRoutes from "../shares/access-request-owner.routes.js";
import {revokeVaultController} from "./vault.controller.js";
import {
    createVaultController,
    listVaultsController,
    getVaultController,
    updateVaultController,
} from "./vault.controller.js";
import {deleteVaultController} from "./vault.controller.js";

import { listWriteRequestsController } from "../shares/write-request-list.controller.js";
import { getWriteRequestDetailController } from "../shares/write-request-detail.controller.js";
import fileRoutes from "../files/file.routes.js";
const router = Router();

// Every vault endpoint requires a valid Cognito token
// and a provisioned, verified database user.
router.use(authenticate, requireProvisionedUser);
router.use("/:id/access-requests", accessRequestOwnerRoutes);
router.use("/:id/shares", shareRoutes);
router.post("/", createVaultController);
router.get("/", listVaultsController);
router.get("/:id", getVaultController);
router.patch("/:id", updateVaultController);
router.post("/:id/revoke", revokeVaultController);
router.delete("/:id", deleteVaultController);
router.use("/:id/shares", shareRevocationRoutes);
router.post(
    "/:id/write-requests/:requestId/review",
    reviewWriteRequestController,
);
router.get(
    "/:id/write-requests/:requestId",
    getWriteRequestDetailController,
);
router.use("/:id/files", fileRoutes);
router.get("/:id/write-requests", listWriteRequestsController);
export default router;