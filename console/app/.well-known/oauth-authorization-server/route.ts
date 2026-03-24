import { NextResponse } from "next/server";

import { getPublicOrigin } from "../../../src/lib/auth";
import { buildAuthorizationServerMetadata } from "../../../src/lib/oauth";

export async function GET(request: Request) {
  const origin = getPublicOrigin(request);
  return NextResponse.json(buildAuthorizationServerMetadata(origin));
}
