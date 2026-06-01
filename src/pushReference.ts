import { ContextBuffer } from './contextBuffer';
import { History } from './history';
import { Config } from './config';
import { copyReference } from './clipboard';
import { showClipboardSuccess, showPushError } from './notify';

export async function pushReference(
  reference: string,
  config: Config,
  buffer: ContextBuffer,
  history: History,
  mode: 'replace' | 'append'
): Promise<void> {
  if (mode === 'replace') {
    buffer.replace(reference);
  } else {
    buffer.append(reference);
  }
  history.add(reference);
  try {
    await copyReference(buffer.getContents());
    showClipboardSuccess(reference, buffer.count, config.showNotifications);
  } catch (err) {
    showPushError(err);
  }
}

export async function pushManyReferences(
  refs: string[],
  config: Config,
  buffer: ContextBuffer,
  history: History
): Promise<void> {
  buffer.appendMany(refs);
  refs.forEach(r => history.add(r));
  try {
    await copyReference(buffer.getContents());
    showClipboardSuccess(`${refs.length} files`, buffer.count, config.showNotifications);
  } catch (err) {
    showPushError(err);
  }
}
