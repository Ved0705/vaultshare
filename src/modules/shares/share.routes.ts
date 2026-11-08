import { Router } from "express";
import { createShareController } from "./share.controller.js";
import { generateSharePassphraseController } from "./share-passphrase.controller.js";

const router = Router({ mergeParams: true });

router.post("/passphrase", generateSharePassphraseController);
router.post("/", createShareController);

export default router;
