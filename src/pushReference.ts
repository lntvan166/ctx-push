import * as vscode from 'vscode';
import { ContextBuffer } from './contextBuffer';
import { History } from './history';
import { Config } from './config';
import { Ref } from './ref';
import { IdeBridge } from './ideBridge';
import { copyReference } from './clipboard';
import { showClipboardSuccess, showPushError, Delivery } from './notify';

export interface PushTargets {
  ref?: Ref;
  bridge?: IdeBridge;
}

function deliveryOf(pushed: boolean, bridge?: IdeBridge): Delivery {
  if (pushed) return 'pushed';
  if (bridge && bridge.registry.count === 0) return 'copied-no-session';
  return 'copied';
}

export async function pushReference(
  reference: string,
  config: Config,
  buffer: ContextBuffer,
  history: History,
  mode: 'replace' | 'append',
  targets: PushTargets = {}
): Promise<void> {
  if (mode === 'replace') {
    buffer.replace(reference);
  } else {
    buffer.append(reference);
  }
  try {
    await copyReference(buffer.getContents());
    history.add(reference, targets.ref);
    const pushed = targets.bridge && targets.ref ? targets.bridge.pushRef(targets.ref) : false;
    showClipboardSuccess(reference, buffer.count - 1, config.showNotifications, deliveryOf(pushed, targets.bridge));
  } catch (err) {
    showPushError(err);
  }
}

export async function pushManyReferences(
  items: Array<{ label: string; ref?: Ref }>,
  config: Config,
  buffer: ContextBuffer,
  history: History,
  bridge?: IdeBridge
): Promise<void> {
  buffer.appendMany(items.map(i => i.label));
  try {
    await copyReference(buffer.getContents());
    items.forEach(i => history.add(i.label, i.ref));
    const refs = items.map(i => i.ref).filter((r): r is Ref => r !== undefined);
    const pushed = bridge && refs.length > 0 ? bridge.pushRefs(refs) : false;
    showClipboardSuccess(
      `${items.length} files`,
      buffer.count - items.length,
      config.showNotifications,
      deliveryOf(pushed, bridge)
    );
  } catch (err) {
    showPushError(err);
  }
}

export async function syncClipboard(buffer: ContextBuffer): Promise<void> {
  try {
    const contents = buffer.getContents();
    if (contents) {
      await copyReference(contents);
    } else {
      await vscode.env.clipboard.writeText('');
    }
  } catch (err) {
    showPushError(err);
  }
}
