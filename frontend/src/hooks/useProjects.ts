import { useState, useEffect, useRef } from 'react';
import type { Project } from '../types/task';
import { apiFetch } from '../utils/api';
import {
  parseProjectPath,
  projectPath,
  findProjectByPathKey,
  resolveInitialProject,
} from '../utils/projectUrl';

const LS_KEY = 'treegantt-current-project';

export function useProjects() {
  const [projects, setProjects]                   = useState<Project[]>([]);
  const [currentProject, setCurrentProjectState]  = useState<Project | null>(null);
  const [loading, setLoading]                     = useState(true);
  // popstate / 改名などで最新の projects を参照するため ref に保持する
  const projectsRef = useRef<Project[]>([]);
  useEffect(() => { projectsRef.current = projects; }, [projects]);

  // プロジェクトを選択する。push=true のときアドレス（URL）も正準パスへ pushState する。
  function selectProject(p: Project | null, opts: { push: boolean }) {
    setCurrentProjectState(p);
    if (p) localStorage.setItem(LS_KEY, p.id);
    else   localStorage.removeItem(LS_KEY);
    if (opts.push) {
      const path = p ? projectPath(p, projectsRef.current) : '/';
      if (window.location.pathname !== path) window.history.pushState({}, '', path);
    }
  }

  // タブ等からの切替（公開 API）。アドレスも更新する。
  function setCurrentProject(p: Project | null) {
    selectProject(p, { push: true });
  }

  useEffect(() => {
    apiFetch('/projects')
      .then(d => {
        const list = d.projects as Project[];
        setProjects(list);
        projectsRef.current = list;
        if (list.length > 0) {
          const urlKey  = parseProjectPath(window.location.pathname);
          const savedId = localStorage.getItem(LS_KEY);
          const target  = resolveInitialProject(list, urlKey, savedId);
          // 初期はアドレスを書き換えない（トップはトップのまま）。永続化のみ更新。
          setCurrentProjectState(target);
          if (target) localStorage.setItem(LS_KEY, target.id);
          // URL に key があるのに解決できなければ、トップへ掃除する
          if (urlKey !== null && !findProjectByPathKey(list, urlKey)) {
            window.history.replaceState({}, '', '/');
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // 戻る/進む（popstate）でアドレスからプロジェクトを再解決する（pushState しない）
  useEffect(() => {
    function onPopState() {
      const list = projectsRef.current;
      if (list.length === 0) return;
      const urlKey = parseProjectPath(window.location.pathname);
      if (urlKey === null) {
        selectProject(resolveInitialProject(list, null, localStorage.getItem(LS_KEY)), { push: false });
        return;
      }
      const found = findProjectByPathKey(list, urlKey);
      if (found) selectProject(found, { push: false });
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  async function createProject(name: string): Promise<void> {
    const data = await apiFetch('/projects', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    const next = [data.project, ...projectsRef.current];
    setProjects(next);
    projectsRef.current = next;
    setCurrentProject(data.project);
  }

  async function renameProject(project: Project, name: string): Promise<void> {
    const data = await apiFetch(`/projects/${project.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
    const next = projectsRef.current.map(p => p.id === project.id ? data.project : p);
    setProjects(next);
    projectsRef.current = next;
    if (currentProject?.id === project.id) {
      setCurrentProjectState(data.project);
      // いまこのプロジェクトのアドレスを表示中なら、新しい名前/IDのアドレスへ追従する
      const urlKey = parseProjectPath(window.location.pathname);
      if (urlKey !== null && findProjectByPathKey(next, urlKey)?.id === project.id) {
        window.history.replaceState({}, '', projectPath(data.project, next));
      }
    }
  }

  async function updateProjectColor(project: Project, color: string | null): Promise<void> {
    const data = await apiFetch(`/projects/${project.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ color }),
    });
    const next = projectsRef.current.map(p => p.id === project.id ? data.project : p);
    setProjects(next);
    projectsRef.current = next;
    if (currentProject?.id === project.id) setCurrentProjectState(data.project);
  }

  async function updateProjectResource(
    project: Project,
    patch: { capacityMinutesPerDay?: number | null; workingDays?: number[] | null },
  ): Promise<void> {
    const data = await apiFetch(`/projects/${project.id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    const next = projectsRef.current.map(p => p.id === project.id ? data.project : p);
    setProjects(next);
    projectsRef.current = next;
    if (currentProject?.id === project.id) setCurrentProjectState(data.project);
  }

  async function deleteProject(project: Project): Promise<void> {
    await apiFetch(`/projects/${project.id}`, { method: 'DELETE' });
    const remaining = projectsRef.current.filter(p => p.id !== project.id);
    setProjects(remaining);
    projectsRef.current = remaining;
    setCurrentProject(remaining.length > 0 ? remaining[0] : null);
  }

  return { projects, currentProject, setCurrentProject, loading, createProject, renameProject, updateProjectColor, updateProjectResource, deleteProject };
}
