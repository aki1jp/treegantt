import * as Y from 'yjs';

let _ydoc: Y.Doc | null = null;

export function getYDoc(): Y.Doc {
  if (!_ydoc) _ydoc = new Y.Doc();
  return _ydoc;
}

export function resetYDoc() {
  if (_ydoc) {
    _ydoc.destroy();
    _ydoc = null;
  }
}
