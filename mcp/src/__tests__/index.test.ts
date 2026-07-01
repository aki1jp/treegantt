import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TOOL_DEFINITIONS } from '../tools.js';

const registerToolMock = vi.fn();
const connectMock = vi.fn().mockResolvedValue(undefined);
const McpServerMock = vi.fn().mockImplementation(function (this: unknown) {
  Object.assign(this as object, { registerTool: registerToolMock, connect: connectMock });
});
const StdioServerTransportMock = vi.fn();

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({ McpServer: McpServerMock }));
vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: StdioServerTransportMock,
}));

const { createServer, main } = await import('../index.js');

describe('createServer', () => {
  beforeEach(() => {
    registerToolMock.mockClear();
    McpServerMock.mockClear();
  });

  it('treegantt-mcp という名前のサーバーを作る', () => {
    createServer();

    expect(McpServerMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'treegantt-mcp' }),
    );
  });

  it('TOOL_DEFINITIONS の全ツールを（書き込み系を増やさず）ちょうど1回ずつ登録する', () => {
    createServer();

    expect(registerToolMock).toHaveBeenCalledTimes(TOOL_DEFINITIONS.length);
    const registeredNames = registerToolMock.mock.calls.map((call) => call[0]);
    expect(registeredNames.sort()).toEqual(TOOL_DEFINITIONS.map((t) => t.name).sort());
  });
});

describe('main', () => {
  it('stdio transport で接続する', async () => {
    await main();

    expect(StdioServerTransportMock).toHaveBeenCalledTimes(1);
    expect(connectMock).toHaveBeenCalledTimes(1);
  });
});
