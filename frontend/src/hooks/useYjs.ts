import { useMemo, useEffect } from 'react';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { useConnectionStore } from '../store/connectionStore';
import { useTaskStore } from '../store/taskStore';
import type { Task } from '../types/task';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:4001';

export function useYjs(projectId: string) {
  const ydoc = useMemo(() => new Y.Doc(), [projectId]);

  const provider = useMemo(
    () =>
      new HocuspocusProvider({
        url: WS_URL,
        name: projectId,
        document: ydoc,
        onStatus: ({ status }) => {
          const mapped =
            status === 'connected'
              ? 'connected'
              : status === 'connecting'
              ? 'connecting'
              : 'disconnected';
          useConnectionStore.getState().setStatus(mapped);
        },
      }),
    [projectId, ydoc]
  );

  const yTasks = useMemo(() => ydoc.getMap<Y.Map<unknown>>('tasks'), [ydoc]);

  useEffect(() => {
    const handler = () => {
      const tasks = Array.from(yTasks.entries()).map(([, yTask]) =>
        Object.fromEntries(yTask.entries()) as unknown as Task
      );
      useTaskStore.getState().setTasks(tasks);
    };
    yTasks.observeDeep(handler);
    return () => {
      yTasks.unobserveDeep(handler);
      provider.destroy();
      ydoc.destroy();
    };
  }, [ydoc, provider, yTasks]);

  return { ydoc, provider, yTasks };
}
