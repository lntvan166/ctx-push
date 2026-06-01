import { Config } from './config';
import { copyReference } from './clipboard';
import { showClipboardSuccess, showPushError } from './notify';

export async function pushReference(reference: string, config: Config): Promise<void> {
  try {
    await copyReference(reference);
    showClipboardSuccess(reference, config.showNotifications);
  } catch (err) {
    showPushError(err);
  }
}
