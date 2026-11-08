import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserPool,
  type CognitoUserSession,
} from "amazon-cognito-identity-js";

const poolId = import.meta.env.VITE_COGNITO_USER_POOL_ID as string | undefined;
const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID as string | undefined;

const pool = poolId && clientId
  ? new CognitoUserPool({ UserPoolId: poolId, ClientId: clientId })
  : null;

function requirePool() {
  if (!pool) throw new Error("Cognito is not configured. Add the User Pool ID and Client ID to frontend/.env.");
  return pool;
}

function cognitoUser(email: string) {
  return new CognitoUser({ Username: email.trim().toLowerCase(), Pool: requirePool() });
}

export function getSession(): Promise<CognitoUserSession | null> {
  const current = pool?.getCurrentUser();
  if (!current) return Promise.resolve(null);
  return new Promise((resolve) => current.getSession((error, session) => {
    if (error || !session?.isValid()) resolve(null);
    else resolve(session);
  }));
}

export function signIn(email: string, password: string): Promise<CognitoUserSession> {
  const user = cognitoUser(email);
  return new Promise((resolve, reject) => user.authenticateUser(
    new AuthenticationDetails({ Username: email.trim().toLowerCase(), Password: password }),
    { onSuccess: resolve, onFailure: reject },
  ));
}

export function signUp(email: string, password: string): Promise<void> {
  const attributes = [new CognitoUserAttribute({ Name: "email", Value: email.trim().toLowerCase() })];
  return new Promise((resolve, reject) => requirePool().signUp(
    email.trim().toLowerCase(), password, attributes, [], (error) => error ? reject(error) : resolve(),
  ));
}

export function confirmSignUp(email: string, code: string): Promise<void> {
  return new Promise((resolve, reject) => cognitoUser(email).confirmRegistration(
    code.trim(), true, (error) => error ? reject(error) : resolve(),
  ));
}

export async function signOut() {
  const current = pool?.getCurrentUser();
  if (current) current.signOut();
}
