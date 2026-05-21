import { useEffect, useRef } from 'react';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { useConnectionStore } from '../store/connectionStore';
import { useTaskStore } from '../store/taskStore';
import type { Task } from '../types/task';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:4001';

interface YjsInstance {
  projectId: string;
  ydoc: Y.Doc;
  provider: HocuspocusProvider;
  yTasks: Y.Map<Y.Map<unknown>>;
}

// Module-level cache so StrictMode double-invocation doesn't destroy the provider
const instanceCache = new Map<string, YjsInstance>();

function getOrCreate(projectId: string): YjsInstance {
  const cached = instanceCache.get(projectId);
  if (cached) return cached;

  const ydoc = new Y.Doc();
  const yTasks = ydoc.getMap<Y.Map<unknown>>('tasks');
  const provider = new HocuspocusProvider({
    url: WS_URL,
    name: projectId,
    document: ydoc,
    onStatus: ({ status }) => {
      const mapped =
        status === 'connected' ? 'connected' :
        status === 'connecting' ? 'connecting' : 'disconnected';
      useConnectionStore.getState().setStatus(mapped);
    },
  });

  const instance: YjsInstance = { projectId, ydoc, provider, yTasks };
  instanceCache.set(projectId, instance);
  return instance;
}

export function useYjs(projectId: string) {
  const instanceRef = useRef<YjsInstance>(getOrCreate(projectId));

  // Switch instance when projectId changes
  if (instanceRef.current.projectId !== projectId) {
    instanceRef.current = getOrCreate(projectId);
  }

  useEffect(() => {
    const { yTasks } = instanceRef.current;

    const handler = () => {
      const tasks = Array.from(yTasks.entries()).map(([, yTask]) =>
        Object.fromEntries(yTask.entries()) as unknown as Task
      );
      useTaskStore.getState().setTasks(tasks);
    };

    yTasks.observeDeep(handler);
    return () => {
      yTasks.unobserveDeep(handler);
    };
  }, [projectId]);

  return {
    ydoc: instanceRef.current.ydoc,
    provider: instanceRef.current.provider,
    yTasks: instanceRef.current.yTasks,
  };
}
