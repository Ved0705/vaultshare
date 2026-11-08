
import { Router } from "express";

import {
    revokeShareController,
    revokeAllSharesController,
} from "./share-revocation.controller.js";
import { extendShareAccessController } from "./share-extension.controller.js";

const router = Router({ mergeParams: true });

router.patch("/revoke-all", revokeAllSharesController);
router.patch("/:shareId/extend", extendShareAccessController);
router.patch("/:shareId/revoke", revokeShareController);

export default router;
