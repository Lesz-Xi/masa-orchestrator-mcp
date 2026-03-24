import { NextResponse } from "next/server";

import { registerClient } from "../../../../src/lib/oauth";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const result = registerClient(body);

  if (result.error) {
    return NextResponse.json(result.error, { status: 400 });
  }

  return NextResponse.json(result.response, { status: 201 });
}
