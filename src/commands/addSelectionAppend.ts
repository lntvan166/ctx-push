import { addSelectionWithMode } from './addSelection';
import { ContextBuffer } from '../contextBuffer';
import { History } from '../history';
import { BridgeProvider } from '../ideBridge';

export async function addSelectionAppend(
  buffer: ContextBuffer,
  history: History,
  getBridge?: BridgeProvider
): Promise<void> {
  await addSelectionWithMode(buffer, history, 'append', getBridge);
}
