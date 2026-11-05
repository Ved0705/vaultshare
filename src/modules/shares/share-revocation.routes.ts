
import { Router } from "express";

import {
    revokeShareController,
    revokeAllSharesController,
} from "./share-revocation.controller.js";

const router = Router({ mergeParams: true });

router.patch("/revoke-all", revokeAllSharesController);
router.patch("/:shareId/revoke", revokeShareController);

export default router;
