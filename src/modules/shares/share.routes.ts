import { Router } from "express";
import { createShareController } from "./share.controller.js";
import { generateSharePassphraseController } from "./share-passphrase.controller.js";
import { listVaultSharesController } from "./share-list.controller.js";
const router = Router({ mergeParams: true });

router.post("/passphrase", generateSharePassphraseController);
router.post("/", createShareController);
router.get("/", listVaultSharesController);
export default router;
