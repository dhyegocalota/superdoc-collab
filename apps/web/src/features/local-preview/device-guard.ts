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
  return null;
}

export function useDeviceRefusal(): DeviceRefusal | null {
  return null;
}
