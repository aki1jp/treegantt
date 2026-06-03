/**
 * 右クリックメニューがビューポートからはみ出さないよう座標をクランプする。
 * vw / vh はテスト時に明示指定できるようにオプション引数にしている。
 */
export function clampMenuPos(x, y, menuW = 144, menuH = 82, vw, vh) {
    const w = vw ?? (typeof window !== 'undefined' ? window.innerWidth : 1920);
    const h = vh ?? (typeof window !== 'undefined' ? window.innerHeight : 1080);
    return {
        top: Math.max(4, Math.min(y, h - menuH - 4)),
        left: Math.max(4, Math.min(x, w - menuW - 4)),
    };
}
