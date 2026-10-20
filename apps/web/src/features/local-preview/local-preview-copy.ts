import { DEVICE_PREPARATION_MIN_MEMORY_GIGABYTES } from '@superdoc-collab/types';
import { DeviceRefusal } from './device-guard';

export const PREVIEW_BADGE_MESSAGE = 'Preview · the shared copy is being prepared';
export const PREVIEW_OPENING_DETAIL = 'Opening a preview on this device';
export const PREVIEW_FAILED_MESSAGE = 'The preview could not be opened. The shared copy is still being prepared.';
export const DEVICE_OFFER_LABEL = 'Prepare on this device';

export const DEVICE_REFUSAL_COPY: Record<DeviceRefusal, string> = {
  [DeviceRefusal.NarrowViewport]:
    'This screen is too narrow to prepare a large document. Open the app on a laptop or desktop and upload it there.',
  [DeviceRefusal.LittleMemory]: `This device reports less than ${DEVICE_PREPARATION_MIN_MEMORY_GIGABYTES} GB of memory, too little to prepare a large document. Upload it from a computer with more memory.`,
};
