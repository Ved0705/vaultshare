import { Router } from "express";

import { authenticate } from "../../middleware/auth.middleware.js";
import { requireProvisionedUser } from "../../middleware/require-provisioned-user.js";

import { openShareController } from "./share-access.controller.js";

const router = Router();

router.use(authenticate, requireProvisionedUser);

router.post("/:shareCode/open", openShareController);

export default router;