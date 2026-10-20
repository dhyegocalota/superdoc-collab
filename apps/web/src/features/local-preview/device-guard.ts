import { DEVICE_PREPARATION_MIN_MEMORY_GIGABYTES, DEVICE_PREVIEW_MIN_MEMORY_GIGABYTES } from '@superdoc-collab/types';
import { useIsPhoneLayout } from '@/lib/use-is-phone-layout';

export enum DeviceRefusal {
  NarrowViewport = 'narrow-viewport',
  LittleMemory = 'little-memory',
}

export function deviceRefusalOf({
  isPhoneLayout,
  deviceMemoryGigabytes,
}: {
  isPhoneLayout: boolean;
  deviceMemoryGigabytes: number | null;
}): DeviceRefusal | null {
  if (isPhoneLayout) return DeviceRefusal.NarrowViewport;
  const isMemoryExposed = deviceMemoryGigabytes !== null;
  if (isMemoryExposed && deviceMemoryGigabytes < DEVICE_PREPARATION_MIN_MEMORY_GIGABYTES) return DeviceRefusal.LittleMemory;
  return null;
}

export function canPreviewOnDevice(deviceMemoryGigabytes: number | null): boolean {
  throw new Error('canPreviewOnDevice is not implemented');
}

function exposedDeviceMemory(): number | null {
  const { deviceMemory } = navigator as Navigator & { deviceMemory?: number };
  if (deviceMemory === undefined) return null;
  return deviceMemory;
}

export function useDeviceRefusal(): DeviceRefusal | null {
  const isPhoneLayout = useIsPhoneLayout();
  return deviceRefusalOf({ isPhoneLayout, deviceMemoryGigabytes: exposedDeviceMemory() });
}
