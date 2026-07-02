import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { pathToFileURL } from 'node:url';
import { TOOL_DEFINITIONS } from './tools.js';

export function createServer(): McpServer {
  const server = new McpServer({ name: 'treegantt-mcp', version: '0.1.0' });

  for (const tool of TOOL_DEFINITIONS) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
      tool.handler,
    );
  }

  return server;
}

export async function main(): Promise<void> {
  const server = createServer();
  await server.connect(new StdioServerTransport());
}

// `file://${argv1}` のような素朴な文字列結合は、Windows の `C:\Users\...`
// パス（バックスラッシュ・ドライブレター）で import.meta.url と一致しなくなり、
// main() が実行されないまま stdio ハンドシェイクをしないプロセスが起動してしまう。
// pathToFileURL はOSごとのパス形式を正しくfile URLへ変換する。
export function isEntryPoint(argv1: string | undefined, moduleUrl: string): boolean {
  if (!argv1) return false;
  return moduleUrl === pathToFileURL(argv1).href;
}

if (isEntryPoint(process.argv[1], import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
