import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { LoginPanel } from "../../src/components/login-panel";
import { SESSION_COOKIE_NAME, loadConsoleEnv, normalizeReturnTo, parseSessionToken } from "../../src/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const cookieStore = await cookies();
  const params = await searchParams;
  const env = loadConsoleEnv();
  const session = parseSessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value, env.sessionSecret);
  const returnTo = normalizeReturnTo(params.returnTo);

  if (session) {
    redirect(returnTo || "/");
  }

  return <LoginPanel returnTo={returnTo} />;
}
