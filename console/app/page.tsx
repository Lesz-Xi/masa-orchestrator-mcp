import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { OperatorConsole } from "../src/components/operator-console";
import { SESSION_COOKIE_NAME, loadConsoleEnv, parseSessionToken } from "../src/lib/auth";

export default async function HomePage() {
  const cookieStore = await cookies();
  const env = loadConsoleEnv();
  const session = parseSessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value, env.sessionSecret);

  if (!session) {
    redirect("/login");
  }

  return <OperatorConsole operatorId={session.operatorId} />;
}
