import * as vscode from 'vscode';
import { ContextBuffer } from '../contextBuffer';
import { History } from '../history';
import { syncClipboard } from '../pushReference';
import { pickFromHistory } from './pickFromHistory';
import { BridgeProvider, IdeBridge } from '../ideBridge';

const BROWSE_HISTORY = '$(history) Browse history…';
const CLEAR_ALL = '$(clear-all) Clear all';
const SWITCH_TARGET = '$(plug) Switch target session…';

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

function buildItems(buffer: ContextBuffer, bridge?: IdeBridge): RefItem[] {
  const refs = buffer.getRefs();
  const items: RefItem[] = refs.length
    ? refs.map((ref, refIndex) => ({ label: ref, refIndex, buttons: [trashButton] }))
    : [{ label: 'Buffer is empty', description: 'Add refs with the add-selection or add-file commands' }];
  items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
  items.push({ label: BROWSE_HISTORY });
  if ((bridge?.registry.count ?? 0) >= 2) {
    items.push({ label: SWITCH_TARGET });
  }
  if (refs.length) {
    items.push({ label: CLEAR_ALL });
  }
  return items;
}

async function switchTarget(bridge: IdeBridge): Promise<void> {
  const sessions = bridge.registry.getAll();
  const targetId = bridge.registry.target?.id;
  interface SessionItem extends vscode.QuickPickItem { id: number }
  const picked = await vscode.window.showQuickPick<SessionItem>(
    sessions.map(s => ({
      id: s.id,
      label: `$(terminal) Claude session${s.pid !== undefined ? ` (pid ${s.pid})` : ''}`,
      description:
        `connected ${new Date(s.connectedAt).toLocaleTimeString()}` +
        (s.id === targetId ? ' — current target' : ''),
    })),
    { placeHolder: 'Pick the session that receives pushed refs' }
  );
  if (picked) bridge.registry.setTarget(picked.id);
}

export function manageBuffer(
  buffer: ContextBuffer,
  history: History,
  getBridge?: BridgeProvider
): void {
  const bridge = getBridge?.();
  const qp = vscode.window.createQuickPick<RefItem>();
  qp.title = title(buffer);
  qp.placeholder = 'Remove refs with the trash button';
  qp.items = buildItems(buffer, bridge);

  qp.onDidTriggerItemButton(async e => {
    if (e.item.refIndex === undefined) return;
    buffer.removeAt(e.item.refIndex);
    qp.title = title(buffer);
    qp.items = buildItems(buffer, bridge);
    await syncClipboard(buffer);
  });

  qp.onDidAccept(async () => {
    const selected = qp.selectedItems[0];
    if (!selected) return;
    if (selected.label === BROWSE_HISTORY) {
      qp.hide();
      await pickFromHistory(buffer, history, getBridge);
    } else if (selected.label === SWITCH_TARGET) {
      qp.hide();
      if (bridge) await switchTarget(bridge);
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
