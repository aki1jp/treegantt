// フロントエンドのバージョン: package.json を単一の出典にする。
// Vite/Vitest は JSON import をネイティブに解決する（tsconfig: resolveJsonModule）。
import pkg from '../package.json';

export const FRONTEND_VERSION: string = (pkg as { version: string }).version;
