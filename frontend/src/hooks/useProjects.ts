import { useState, useEffect } from 'react';
import type { Project } from '../types/task';
import { apiFetch } from '../utils/api';

const LS_KEY = 'treegantt-current-project';

export function useProjects() {
  const [projects, setProjects]                   = useState<Project[]>([]);
  const [currentProject, setCurrentProjectState]  = useState<Project | null>(null);
  const [loading, setLoading]                     = useState(true);

  function setCurrentProject(p: Project | null) {
    setCurrentProjectState(p);
    if (p) localStorage.setItem(LS_KEY, p.id);
    else   localStorage.removeItem(LS_KEY);
  }

  useEffect(() => {
    apiFetch('/projects')
      .then(d => {
        setProjects(d.projects);
        if (d.projects.length > 0) {
          const savedId = localStorage.getItem(LS_KEY);
          const saved   = savedId ? (d.projects as Project[]).find(p => p.id === savedId) ?? null : null;
          setCurrentProject(saved ?? d.projects[0]);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function createProject(name: string): Promise<void> {
    const data = await apiFetch('/projects', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    setProjects(prev => [data.project, ...prev]);
    setCurrentProject(data.project);
  }

  async function renameProject(project: Project, name: string): Promise<void> {
    const data = await apiFetch(`/projects/${project.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
    setProjects(prev => prev.map(p => p.id === project.id ? data.project : p));
    setCurrentProject(
      currentProject?.id === project.id ? data.project : currentProject
    );
  }

  async function updateProjectColor(project: Project, color: string | null): Promise<void> {
    const data = await apiFetch(`/projects/${project.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ color }),
    });
    setProjects(prev => prev.map(p => p.id === project.id ? data.project : p));
    if (currentProject?.id === project.id) setCurrentProjectState(data.project);
  }

  async function deleteProject(project: Project): Promise<void> {
    await apiFetch(`/projects/${project.id}`, { method: 'DELETE' });
    const remaining = projects.filter(p => p.id !== project.id);
    setProjects(remaining);
    setCurrentProject(remaining.length > 0 ? remaining[0] : null);
  }

  return { projects, currentProject, setCurrentProject, loading, createProject, renameProject, updateProjectColor, deleteProject };
}
