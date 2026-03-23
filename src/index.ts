import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { SERVER_NAME } from "./constants.js";
import { createServer } from "./server.js";

async function main() {
  const server = createServer(import.meta.url);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(`[${SERVER_NAME}] fatal error`, error);
  process.exitCode = 1;
});
