import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { requireProvisionedUser } from "../../middleware/require-provisioned-user.js";
import {
    createFolderController,
    deleteFolderController,
    listFoldersController,
    updateFolderController,
} from "./folder.controller.js";

const router = Router();

router.use(authenticate, requireProvisionedUser);
router.post("/", createFolderController);
router.get("/", listFoldersController);
router.patch("/:id", updateFolderController);
router.delete("/:id", deleteFolderController);

export default router;
