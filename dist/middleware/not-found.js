import { AppError } from "../shared/app-error.js";
export const notFoundHandler = (_req, _res, next) => {
    next(new AppError(404, "ROUTE_NOT_FOUND", "The requested resource was not found"));
};
//# sourceMappingURL=not-found.js.map