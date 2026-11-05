import { Router } from "express";

import {
    listAccessRequestsController,
    reviewAccessRequestController,
} from "./access-request-owner.controller.js";

const router = Router({ mergeParams: true });

router.get("/", listAccessRequestsController);
router.patch("/:requestId/review", reviewAccessRequestController);

export default router;
