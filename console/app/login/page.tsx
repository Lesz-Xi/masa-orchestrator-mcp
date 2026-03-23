import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { LoginPanel } from "../../src/components/login-panel";
import { SESSION_COOKIE_NAME, loadConsoleEnv, parseSessionToken } from "../../src/lib/auth";

export default async function LoginPage() {
  const cookieStore = await cookies();
  const env = loadConsoleEnv();
  const session = parseSessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value, env.sessionSecret);

  if (session) {
    redirect("/");
  }

  return <LoginPanel />;
}
