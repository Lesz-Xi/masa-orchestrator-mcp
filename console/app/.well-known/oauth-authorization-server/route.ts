import { NextResponse } from "next/server";

import { buildAuthorizationServerMetadata } from "../../../src/lib/oauth";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return NextResponse.json(buildAuthorizationServerMetadata(origin));
}
