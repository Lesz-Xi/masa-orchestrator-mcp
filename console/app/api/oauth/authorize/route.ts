import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, loadConsoleEnv, normalizeReturnTo, parseSessionToken } from "../../../../src/lib/auth";
import {
  buildAuthorizeErrorRedirect,
  isAllowedOAuthRedirectUri,
  issueAuthorizationCode,
} from "../../../../src/lib/oauth";
import { normalizeAbsoluteUrl } from "../../../../../src/http/oauth";

function normalizedClientId(value: string | null): string {
  return (value || "anthropic-connector").trim() || "anthropic-connector";
}

export async function GET(request: Request) {
  const env = loadConsoleEnv();
  const requestUrl = new URL(request.url);
  const responseType = requestUrl.searchParams.get("response_type");
  const redirectUri = requestUrl.searchParams.get("redirect_uri");
  const state = requestUrl.searchParams.get("state");
  const codeChallenge = requestUrl.searchParams.get("code_challenge");
  const codeChallengeMethod = requestUrl.searchParams.get("code_challenge_method");
  const resource = normalizeAbsoluteUrl(requestUrl.searchParams.get("resource") || env.mcpUrl);

  if (!isAllowedOAuthRedirectUri(redirectUri)) {
    return NextResponse.json({ error: "invalid_redirect_uri" }, { status: 400 });
  }

  if (responseType !== "code" || !codeChallenge || codeChallengeMethod !== "S256" || !resource) {
    return NextResponse.redirect(
      buildAuthorizeErrorRedirect(redirectUri, "invalid_request", state, "Missing response_type, PKCE, or resource.")
    );
  }

  const cookieStore = await cookies();
  const session = parseSessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value, env.sessionSecret);

  if (!session) {
    const returnTo = normalizeReturnTo(`${requestUrl.pathname}${requestUrl.search}`) || "/api/oauth/authorize";
    return NextResponse.redirect(new URL(`/login?returnTo=${encodeURIComponent(returnTo)}`, requestUrl.origin));
  }

  const code = issueAuthorizationCode({
    clientId: normalizedClientId(requestUrl.searchParams.get("client_id")),
    redirectUri,
    codeChallenge,
    codeChallengeMethod: "S256",
    operatorId: session.operatorId,
    resource,
  });

  const location = new URL(redirectUri);
  location.searchParams.set("code", code);
  if (state) {
    location.searchParams.set("state", state);
  }
  location.searchParams.set("iss", requestUrl.origin);

  return NextResponse.redirect(location);
}
