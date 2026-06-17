// プロジェクトごとのアドレス（URL）の純関数群（§9.7）。
// ルーターは導入せず、URL ⇄ プロジェクトの対応をここに集約する。
import type { Project } from '../types/task';

export const PROJECT_PATH_PREFIX = '/p/';

/** `/p/<key>` の pathname から key（プロジェクト名または ID）をデコードして返す。該当しなければ null。 */
export function parseProjectPath(pathname: string): string | null {
  if (!pathname.startsWith(PROJECT_PATH_PREFIX)) return null;
  const raw = pathname.slice(PROJECT_PATH_PREFIX.length);
  if (raw === '') return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw; // 不正なエンコードはそのまま扱う
  }
}

/** プロジェクトの正準アドレス。名前がユニークなら名前、同名が複数あるなら ID を使う。 */
export function projectPath(project: Project, projects: Project[]): string {
  const nameIsUnique = projects.filter(p => p.name === project.name).length <= 1;
  const key = nameIsUnique ? project.name : project.id;
  return PROJECT_PATH_PREFIX + encodeURIComponent(key);
}

/**
 * URL の key からプロジェクトを解決する（ID 優先）。
 * ①ID 一致 → ②名前がちょうど 1 件一致 → ③名前が複数一致は先頭 → ④null。
 */
export function findProjectByPathKey(projects: Project[], key: string): Project | null {
  const byId = projects.find(p => p.id === key);
  if (byId) return byId;
  const byName = projects.filter(p => p.name === key);
  if (byName.length >= 1) return byName[0];
  return null;
}

/** 初期選択の解決。優先順位: URL の key > localStorage の savedId > 先頭。 */
export function resolveInitialProject(
  projects: Project[],
  urlKey: string | null,
  savedId: string | null,
): Project | null {
  if (projects.length === 0) return null;
  if (urlKey !== null) {
    const fromUrl = findProjectByPathKey(projects, urlKey);
    if (fromUrl) return fromUrl;
  }
  if (savedId) {
    const saved = projects.find(p => p.id === savedId);
    if (saved) return saved;
  }
  return projects[0];
}
