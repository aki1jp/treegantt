// UI 表示文言の日本語辞書（フラットな Record<string, string>）。
// キーはドット区切りの名前空間文字列（例: 'toolbar.addTask'）。
// en.ts は `satisfies typeof ja` によりキー集合の完全一致がビルド時に強制される。
export const ja = {
  'common.cancel': 'キャンセル',
  'common.save': '保存',
  'common.delete': '削除',
  'common.close': '閉じる',

  'theme.light': 'ライトモード',
  'theme.dark': 'ダークモード',
  'theme.auto': 'システム設定に従う',

  'locale.ja': 'JA',
  'locale.en': 'EN',

  'app.locale.switchAriaLabel': '表示言語を切り替え',
  'app.deleteProjectConfirm': '「{name}」を削除しますか？',

  'apiError.notFound': '対象が見つかりません。',
  'apiError.invalidFormat': 'インポート形式が不正です。',
  'apiError.selfRef': '同一プロジェクト内のタスクは参照できません。',
  'apiError.invalidRefTask': '参照先のタスクが不正です。',
  'apiError.invalidParent': '親タスクの指定が不正です。',
  'apiError.milestoneCannotBeParent': 'マイルストーンは親タスクにできません。',
  'apiError.depCycleDetected': '依存関係が循環しています。',
  'apiError.invalidProject': 'タスクが指定されたプロジェクトに属していません。',
  'apiError.cycleDetected': '親子関係が循環しています。',
  'apiError.invalidParentRef': '親タスクの参照が不正です。',
  'apiError.internalError': 'サーバー内部でエラーが発生しました。',
};
