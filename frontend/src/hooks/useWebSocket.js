import { useEffect } from 'react';
import { useTaskStore } from '../store/taskStore';
const WS_URL = import.meta.env.VITE_WS_URL ?? `ws://${window.location.hostname}:4001`;
const RECONNECT_DELAY_MS = 3000;
// Module-level singleton: React StrictMode の二重マウントでも接続を維持
let _ws = null;
let _projectId = null;
let _reconnectTimer = null;
export function applyMessage(msg) {
    const store = useTaskStore.getState();
    const tasks = store.tasks;
    switch (msg.type) {
        case 'task_created': {
            const task = msg.task;
            if (!tasks.some(t => t.id === task.id)) {
                store.setTasks([...tasks, task]);
            }
            break;
        }
        case 'task_updated': {
            const task = msg.task;
            store.setTasks(tasks.map(t => t.id === task.id ? task : t));
            break;
        }
        case 'task_deleted': {
            store.setTasks(tasks.filter(t => t.id !== msg.id));
            break;
        }
        case 'tasks_reordered': {
            const orders = msg.orders;
            const map = new Map(orders.map(o => [o.id, o.order]));
            store.setTasks(tasks.map(t => map.has(t.id) ? { ...t, order: map.get(t.id) } : t));
            break;
        }
        case 'reload': {
            // import 後など: App 側でリロードトリガーを発火させる
            store.setNeedsReload(true);
            break;
        }
    }
}
function openWs(projectId) {
    if (_reconnectTimer) {
        clearTimeout(_reconnectTimer);
        _reconnectTimer = null;
    }
    if (_ws) {
        _ws.onclose = null;
        _ws.onerror = null;
        _ws.close();
        _ws = null;
    }
    _projectId = projectId;
    const ws = new WebSocket(WS_URL);
    _ws = ws;
    ws.onopen = () => {
        if (_projectId !== projectId) {
            ws.close();
            return;
        }
        ws.send(JSON.stringify({ type: 'subscribe', projectId }));
    };
    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            if (msg.projectId !== _projectId)
                return;
            applyMessage(msg);
        }
        catch { /* malformed — ignore */ }
    };
    ws.onclose = () => {
        if (_projectId !== projectId)
            return;
        _reconnectTimer = setTimeout(() => openWs(projectId), RECONNECT_DELAY_MS);
    };
    ws.onerror = () => { };
}
export function useWebSocket(projectId) {
    useEffect(() => {
        if (!projectId) {
            if (_ws) {
                _ws.onclose = null;
                _ws.onerror = null;
                _ws.close();
                _ws = null;
            }
            if (_reconnectTimer) {
                clearTimeout(_reconnectTimer);
                _reconnectTimer = null;
            }
            _projectId = null;
            return;
        }
        if (_projectId === projectId && _ws?.readyState === WebSocket.OPEN)
            return;
        openWs(projectId);
    }, [projectId]);
}
