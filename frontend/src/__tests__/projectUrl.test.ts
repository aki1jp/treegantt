import { describe, it, expect } from 'vitest';
import type { Project } from '../types/task';
import {
  parseProjectPath,
  projectPath,
  findProjectByPathKey,
  resolveInitialProject,
} from '../utils/projectUrl';

function makeProject(id: string, name: string): Project {
  return { id, name, color: null, createdAt: '2026-01-01' };
}

describe('parseProjectPath', () => {
  it('/p/<key> から key をデコードして返す', () => {
    expect(parseProjectPath('/p/Beta')).toBe('Beta');
  });
  it('URL エンコードされた日本語をデコードする', () => {
    expect(parseProjectPath('/p/' + encodeURIComponent('日本語'))).toBe('日本語');
  });
  it('スラッシュを含む名前（%2F）も 1 セグメントとしてデコードする', () => {
    expect(parseProjectPath('/p/' + encodeURIComponent('a/b'))).toBe('a/b');
  });
  it('トップ（/）は null', () => {
    expect(parseProjectPath('/')).toBeNull();
  });
  it('/p/ 以外のパスは null', () => {
    expect(parseProjectPath('/other')).toBeNull();
    expect(parseProjectPath('/projects/x')).toBeNull();
  });
});

describe('projectPath', () => {
  it('名前がユニークなら /p/<名前>', () => {
    const projects = [makeProject('id1', 'Alpha'), makeProject('id2', 'Beta')];
    expect(projectPath(projects[0], projects)).toBe('/p/Alpha');
  });
  it('同名が複数あるプロジェクトは /p/<id>', () => {
    const dup = makeProject('id1', 'Same');
    const projects = [dup, makeProject('id2', 'Same')];
    expect(projectPath(dup, projects)).toBe('/p/id1');
  });
  it('空白・日本語はエンコードする', () => {
    const p = makeProject('id1', 'My Project 日本');
    expect(projectPath(p, [p])).toBe('/p/' + encodeURIComponent('My Project 日本'));
  });
});

describe('findProjectByPathKey', () => {
  it('ID が一致すればそのプロジェクト', () => {
    const projects = [makeProject('id1', 'Alpha'), makeProject('id2', 'Beta')];
    expect(findProjectByPathKey(projects, 'id2')?.id).toBe('id2');
  });
  it('名前がちょうど1件一致すればそのプロジェクト', () => {
    const projects = [makeProject('id1', 'Alpha'), makeProject('id2', 'Beta')];
    expect(findProjectByPathKey(projects, 'Beta')?.id).toBe('id2');
  });
  it('同名が複数なら先頭を返す', () => {
    const projects = [makeProject('id1', 'Same'), makeProject('id2', 'Same')];
    expect(findProjectByPathKey(projects, 'Same')?.id).toBe('id1');
  });
  it('同名複数でも 2 件目の ID を指定すればその 2 件目', () => {
    const projects = [makeProject('id1', 'Same'), makeProject('id2', 'Same')];
    expect(findProjectByPathKey(projects, 'id2')?.id).toBe('id2');
  });
  it('名前が他プロジェクトの ID と一致したら ID 側を返す（ID 優先）', () => {
    // p2 の ID は 'collide'、p1 の名前も 'collide'
    const p1 = makeProject('id1', 'collide');
    const p2 = makeProject('collide', 'Other');
    const projects = [p1, p2];
    expect(findProjectByPathKey(projects, 'collide')?.id).toBe('collide');
  });
  it('一致なしは null', () => {
    const projects = [makeProject('id1', 'Alpha')];
    expect(findProjectByPathKey(projects, 'nope')).toBeNull();
  });
});

describe('resolveInitialProject', () => {
  const projects = [makeProject('id1', 'Alpha'), makeProject('id2', 'Beta')];

  it('URL の key（名前）が最優先', () => {
    expect(resolveInitialProject(projects, 'Beta', 'id1')?.id).toBe('id2');
  });
  it('URL の key（ID）でも解決する', () => {
    expect(resolveInitialProject(projects, 'id2', 'id1')?.id).toBe('id2');
  });
  it('URL が解決不能なら savedId を使う', () => {
    expect(resolveInitialProject(projects, 'nope', 'id2')?.id).toBe('id2');
  });
  it('URL も savedId も無ければ先頭', () => {
    expect(resolveInitialProject(projects, null, null)?.id).toBe('id1');
  });
  it('savedId が無効なら先頭', () => {
    expect(resolveInitialProject(projects, null, 'deleted')?.id).toBe('id1');
  });
  it('空配列は null', () => {
    expect(resolveInitialProject([], 'x', 'y')).toBeNull();
  });
});
