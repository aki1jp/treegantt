import { useEffect, useRef, useState } from 'react';
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

// Module-level cache: StrictModeの二重マウントでproviderが破棄されないよう保持
const instanceCache = new Map<string, YjsInstance>();
// 同期完了フラグのキャッシュ（再マウント時にonSyncedを再待ちしないため）
const syncedCache = new Map<string, boolean>();
// syncedキャッシュ変更を購読するリスナー
const syncedListeners = new Map<string, Set<() => void>>();

function notifySynced(projectId: string) {
  syncedCache.set(projectId, true);
  syncedListeners.get(projectId)?.forEach(fn => fn());
}

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
        status === 'connected'    ? 'connected'    :
        status === 'connecting'   ? 'connecting'   : 'disconnected';
      useConnectionStore.getState().setStatus(mapped);
    },
    onSynced: ({ state }) => {
      // state=true: Hocuspocusとの初回同期完了
      if (state) notifySynced(projectId);
    },
  });

  const instance: YjsInstance = { projectId, ydoc, provider, yTasks };
  instanceCache.set(projectId, instance);
  return instance;
}

export function useYjs(projectId: string) {
  const instanceRef = useRef<YjsInstance>(getOrCreate(projectId));

  if (instanceRef.current.projectId !== projectId) {
    instanceRef.current = getOrCreate(projectId);
  }

  // 同期完了フラグ（キャッシュ済みなら即true）
  const [synced, setSynced] = useState(() => syncedCache.get(projectId) ?? false);

  useEffect(() => {
    // プロジェクトが変わったらフラグをリセット
    setSynced(syncedCache.get(projectId) ?? false);

    // 未完了なら完了を待つ
    if (syncedCache.get(projectId)) return;

    const listeners = syncedListeners.get(projectId) ?? new Set();
    const handler = () => setSynced(true);
    listeners.add(handler);
    syncedListeners.set(projectId, listeners);
    return () => { listeners.delete(handler); };
  }, [projectId]);

  useEffect(() => {
    const { yTasks } = instanceRef.current;

    const handler = () => {
      const tasks = Array.from(yTasks.entries()).map(([, yTask]) =>
        Object.fromEntries(yTask.entries()) as unknown as Task
      );
      useTaskStore.getState().setTasks(tasks);
    };

    yTasks.observeDeep(handler);
    return () => { yTasks.unobserveDeep(handler); };
  }, [projectId]);

  return {
    ydoc:     instanceRef.current.ydoc,
    provider: instanceRef.current.provider,
    yTasks:   instanceRef.current.yTasks,
    synced,
  };
}
