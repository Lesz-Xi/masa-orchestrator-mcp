import { NextResponse } from "next/server";

import { loadConsoleEnv } from "../../../../src/lib/auth";
import {
  buildPkceChallenge,
  consumeAuthorizationCode,
  issueAuthorizationCodeAccessToken,
} from "../../../../src/lib/oauth";

function tokenError(error: string, description: string, status = 400) {
  return NextResponse.json(
    {
      error,
      error_description: description,
    },
    { status }
  );
}

function readFormParams(body: string): URLSearchParams {
  return new URLSearchParams(body);
}

export async function POST(request: Request) {
  const env = loadConsoleEnv();
  const params = readFormParams(await request.text());

  const grantType = params.get("grant_type");
  const code = params.get("code");
  const redirectUri = params.get("redirect_uri");
  const codeVerifier = params.get("code_verifier");
  const clientId = (params.get("client_id") || "anthropic-connector").trim() || "anthropic-connector";

  if (grantType !== "authorization_code" || !code || !redirectUri || !codeVerifier) {
    return tokenError("invalid_request", "Missing grant_type, code, redirect_uri, or code_verifier.");
  }

  const authorizationCode = consumeAuthorizationCode(code);
  if (!authorizationCode) {
    return tokenError("invalid_grant", "Authorization code is invalid or expired.");
  }

  if (
    authorizationCode.redirectUri !== redirectUri ||
    authorizationCode.clientId !== clientId ||
    authorizationCode.codeChallenge !== buildPkceChallenge(codeVerifier)
  ) {
    return tokenError("invalid_grant", "Authorization code validation failed.");
  }

  const { accessToken, expiresIn } = issueAuthorizationCodeAccessToken({
    apiToken: env.apiToken,
    authServerOrigin: new URL(request.url).origin,
    clientId,
    operatorId: authorizationCode.operatorId,
    resource: authorizationCode.resource,
  });

  return NextResponse.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: expiresIn,
    scope: "mcp",
    resource: authorizationCode.resource,
  });
}
