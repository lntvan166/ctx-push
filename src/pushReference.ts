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
  try {
    await copyReference(buffer.getContents());
    history.add(reference);
    showClipboardSuccess(reference, buffer.count - 1, config.showNotifications);
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
  try {
    await copyReference(buffer.getContents());
    refs.forEach(r => history.add(r));
    showClipboardSuccess(`${refs.length} files`, buffer.count - refs.length, config.showNotifications);
  } catch (err) {
    showPushError(err);
  }
}
