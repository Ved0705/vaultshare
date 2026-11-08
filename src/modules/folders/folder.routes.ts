import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { requireProvisionedUser } from "../../middleware/require-provisioned-user.js";
import { deleteFolderController } from "./folder.controller.js";

const router = Router();

router.use(authenticate, requireProvisionedUser);
router.delete("/:id", deleteFolderController);

export default router;
