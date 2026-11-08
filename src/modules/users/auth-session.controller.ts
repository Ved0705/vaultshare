import type { Request, Response, NextFunction } from "express";
import { db } from "../../db/client.js";
import { revokedAccessTokens } from "../../db/schema/revoked-access-tokens.js";
import { AppError } from "../../shared/app-error.js";
export async function logoutController(req:Request,res:Response,next:NextFunction){
 try {
  const jti=req.user?.jti; const expiresAt=req.user?.tokenExpiresAt;
  if(!jti||!expiresAt) throw new AppError(401,"INVALID_TOKEN","A revocable access token is required.");
  await db.insert(revokedAccessTokens).values({jti,expiresAt}).onConflictDoNothing();
  res.status(204).send();
 } catch(error){next(error);}
}
