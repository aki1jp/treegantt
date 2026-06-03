// @vitest-environment node
/**
 * start.sh の .env 読み込み動作をテストする。
 * bash サブプロセスで .env をソースし、変数がエクスポートされることを確認する。
 */
import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
function runInTmpWithEnv(envContent, command) {
    const tmp = mkdtempSync(join(tmpdir(), 'treegantt-test-'));
    try {
        writeFileSync(join(tmp, '.env'), envContent);
        // start.sh の .env 読み込みロジックと同じコードを実行する
        const script = `
      cd "${tmp}"
      if [ -f ".env" ]; then
        set -a
        source .env
        set +a
      fi
      ${command}
    `;
        return execSync(`bash -c '${script}'`, { encoding: 'utf8' }).trim();
    }
    finally {
        rmSync(tmp, { recursive: true, force: true });
    }
}
describe('start.sh: .env 読み込み', () => {
    it('.env の FRONTEND_PORT を読み込んで子プロセスに伝達する', () => {
        const result = runInTmpWithEnv('FRONTEND_PORT=9999\n', 'printf "%s" "$FRONTEND_PORT"');
        expect(result).toBe('9999');
    });
    it('.env の PORT を読み込む', () => {
        const result = runInTmpWithEnv('PORT=5000\n', 'printf "%s" "$PORT"');
        expect(result).toBe('5000');
    });
    it('.env の WS_PORT を読み込む', () => {
        const result = runInTmpWithEnv('WS_PORT=5001\n', 'printf "%s" "$WS_PORT"');
        expect(result).toBe('5001');
    });
    it('3 つのポートを同時に設定できる', () => {
        const env = 'FRONTEND_PORT=8080\nPORT=8000\nWS_PORT=8001\n';
        const result = runInTmpWithEnv(env, 'printf "%s:%s:%s" "$FRONTEND_PORT" "$PORT" "$WS_PORT"');
        expect(result).toBe('8080:8000:8001');
    });
    it('.env がなくても変数が未設定のまま（エラーにならない）', () => {
        const tmp = mkdtempSync(join(tmpdir(), 'treegantt-test-'));
        try {
            // .env を作らない
            const script = `
        cd "${tmp}"
        if [ -f ".env" ]; then
          set -a; source .env; set +a
        fi
        printf "%s" "\${FRONTEND_PORT:-DEFAULT}"
      `;
            const result = execSync(`bash -c '${script}'`, { encoding: 'utf8' }).trim();
            expect(result).toBe('DEFAULT');
        }
        finally {
            rmSync(tmp, { recursive: true, force: true });
        }
    });
    it('.env のコメント行（#）は無視される', () => {
        const env = '# このコメントは無視される\nFRONTEND_PORT=7070\n';
        const result = runInTmpWithEnv(env, 'printf "%s" "$FRONTEND_PORT"');
        expect(result).toBe('7070');
    });
});
