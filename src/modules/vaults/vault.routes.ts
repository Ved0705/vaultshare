import { Router } from "express";

import { authenticate } from "../../middleware/auth.middleware.js";
import { requireProvisionedUser } from "../../middleware/require-provisioned-user.js";

import {
    createVaultController,
    listVaultsController,
    getVaultController,
    updateVaultController,
} from "./vault.controller.js";

const router = Router();

// Every vault endpoint requires a valid Cognito token
// and a provisioned, verified database user.
router.use(authenticate, requireProvisionedUser);

router.post("/", createVaultController);
router.get("/", listVaultsController);
router.get("/:id", getVaultController);
router.patch("/:id", updateVaultController);

export default router;