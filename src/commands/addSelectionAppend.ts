import { addSelectionWithMode } from './addSelection';
import { ContextBuffer } from '../contextBuffer';
import { History } from '../history';

export async function addSelectionAppend(buffer: ContextBuffer, history: History): Promise<void> {
  await addSelectionWithMode(buffer, history, 'append');
}
