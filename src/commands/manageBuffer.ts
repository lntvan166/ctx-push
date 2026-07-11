import * as vscode from 'vscode';
import { ContextBuffer } from '../contextBuffer';
import { History } from '../history';
import { syncClipboard } from '../pushReference';
import { pickFromHistory } from './pickFromHistory';

const BROWSE_HISTORY = '$(history) Browse history…';
const CLEAR_ALL = '$(clear-all) Clear all';

interface RefItem extends vscode.QuickPickItem {
  refIndex?: number;
}

const trashButton: vscode.QuickInputButton = {
  iconPath: new vscode.ThemeIcon('trash'),
  tooltip: 'Remove from buffer',
};

function title(buffer: ContextBuffer): string {
  return `Claude Context — ${buffer.count} ${buffer.count === 1 ? 'ref' : 'refs'}`;
}

function buildItems(buffer: ContextBuffer): RefItem[] {
  const refs = buffer.getRefs();
  const items: RefItem[] = refs.length
    ? refs.map((ref, refIndex) => ({ label: ref, refIndex, buttons: [trashButton] }))
    : [{ label: 'Buffer is empty', description: 'Add refs with the add-selection or add-file commands' }];
  items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
  items.push({ label: BROWSE_HISTORY });
  if (refs.length) {
    items.push({ label: CLEAR_ALL });
  }
  return items;
}

export function manageBuffer(buffer: ContextBuffer, history: History): void {
  const qp = vscode.window.createQuickPick<RefItem>();
  qp.title = title(buffer);
  qp.placeholder = 'Remove refs with the trash button';
  qp.items = buildItems(buffer);

  qp.onDidTriggerItemButton(async e => {
    if (e.item.refIndex === undefined) return;
    buffer.removeAt(e.item.refIndex);
    await syncClipboard(buffer);
    qp.title = title(buffer);
    qp.items = buildItems(buffer);
  });

  qp.onDidAccept(async () => {
    const selected = qp.selectedItems[0];
    if (!selected) return;
    if (selected.label === BROWSE_HISTORY) {
      qp.hide();
      await pickFromHistory(buffer, history);
    } else if (selected.label === CLEAR_ALL) {
      buffer.clear();
      await syncClipboard(buffer);
      qp.hide();
    }
    // Enter on a ref row (or the empty placeholder): intentionally no action
  });

  qp.onDidHide(() => qp.dispose());
  qp.show();
}
