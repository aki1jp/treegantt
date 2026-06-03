import { useLayoutEffect } from 'react';
import { useTaskStore } from '../store/taskStore';
import { resolveTheme, applyThemeVars } from '../utils/theme';
export function useTheme() {
    const theme = useTaskStore(s => s.theme);
    useLayoutEffect(() => {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        function apply() {
            applyThemeVars(resolveTheme(theme, mq.matches));
        }
        apply();
        mq.addEventListener('change', apply);
        return () => mq.removeEventListener('change', apply);
    }, [theme]);
}
