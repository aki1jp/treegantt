import { useState, useEffect } from 'react';
import type { Project } from '../types/task';
import { apiFetch } from '../utils/api';

export function useProjects() {
  const [projects, setProjects]             = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [loading, setLoading]               = useState(true);

  useEffect(() => {
    apiFetch('/projects')
      .then(d => {
        setProjects(d.projects);
        if (d.projects.length > 0) setCurrentProject(d.projects[0]);
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

  async function deleteProject(project: Project): Promise<void> {
    await apiFetch(`/projects/${project.id}`, { method: 'DELETE' });
    setProjects(prev => {
      const remaining = prev.filter(p => p.id !== project.id);
      setCurrentProject(remaining.length > 0 ? remaining[0] : null);
      return remaining;
    });
  }

  return { projects, currentProject, setCurrentProject, loading, createProject, deleteProject };
}
