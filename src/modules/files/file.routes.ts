import { downloadFileController } from "./file.controller.js";
import { Router } from "express";
import {listFilesController} from "./file.controller.js";
import { fileUpload } from "./file-upload.middleware.js";
import { uploadFileController } from "./file.controller.js";

const router = Router({ mergeParams: true });
import { deleteFileController } from "./file.controller.js";

router.delete("/:fileId", deleteFileController);
router.post(
    "/",
    fileUpload.single("file"),
    uploadFileController,
);
router.get("/", listFilesController);
router.get("/:fileId/download", downloadFileController);
export default router;
