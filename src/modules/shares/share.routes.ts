
import { Router } from "express";
import { createShareController } from "./share.controller.js";

const router = Router({ mergeParams: true });

router.post("/", createShareController);

export default router;
