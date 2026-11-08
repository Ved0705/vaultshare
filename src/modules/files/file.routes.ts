import { Router } from "express";
import { fileOperationRateLimiter } from "../../middleware/security-rate-limit.js";
import {
    deleteFileController, downloadFileController, listFilesController, uploadFileController,
} from "./file.controller.js";
import { fileUpload } from "./file-upload.middleware.js";

const router = Router({ mergeParams: true });
router.delete("/:fileId", fileOperationRateLimiter, deleteFileController);
router.post("/", fileOperationRateLimiter, fileUpload.single("file"), uploadFileController);
router.get("/", listFilesController);
router.get("/:fileId/download", fileOperationRateLimiter, downloadFileController);
export default router;
