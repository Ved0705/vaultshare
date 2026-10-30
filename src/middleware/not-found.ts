import type { RequestHandler } from "express";
import { AppError } from "../shared/app-error.js";

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
    next(new AppError(404, "ROUTE_NOT_FOUND", "The requested resource was not found"));
};
