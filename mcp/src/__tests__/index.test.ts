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

  it('各ツールの description・inputSchema を TOOL_DEFINITIONS のまま欠落・改変せずに登録する', () => {
    createServer();

    for (const def of TOOL_DEFINITIONS) {
      const call = registerToolMock.mock.calls.find((c) => c[0] === def.name);
      expect(call).toBeDefined();
      const [, config, handler] = call as [string, { description?: string; inputSchema?: unknown }, unknown];
      expect(config.description).toBe(def.description);
      expect(config.inputSchema).toBe(def.inputSchema);
      expect(handler).toBe(def.handler);
    }
  });

  it('createServer を複数回呼んでも独立したサーバーインスタンスになる（状態を使い回さない）', () => {
    const first = createServer();
    const second = createServer();

    expect(first).not.toBe(second);
    expect(McpServerMock).toHaveBeenCalledTimes(2);
  });
});

describe('main', () => {
  it('stdio transport で接続する', async () => {
    await main();

    expect(StdioServerTransportMock).toHaveBeenCalledTimes(1);
    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(connectMock.mock.calls[0][0]).toBeInstanceOf(StdioServerTransportMock);
  });

  it('接続に失敗したら握りつぶさずエラーを伝播する', async () => {
    connectMock.mockRejectedValueOnce(new Error('stdio pipe closed'));

    await expect(main()).rejects.toThrow('stdio pipe closed');
  });
});
