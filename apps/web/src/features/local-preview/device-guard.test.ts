import { DEVICE_PREPARATION_MIN_MEMORY_GIGABYTES } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { DeviceRefusal, deviceRefusalOf } from './device-guard';

const ENOUGH_MEMORY_GIGABYTES = DEVICE_PREPARATION_MIN_MEMORY_GIGABYTES;
const LITTLE_MEMORY_GIGABYTES = DEVICE_PREPARATION_MIN_MEMORY_GIGABYTES - 1;

test('a phone layout is refused for its viewport', () => {
  expect(deviceRefusalOf({ isPhoneLayout: true, deviceMemoryGigabytes: ENOUGH_MEMORY_GIGABYTES })).toBe(DeviceRefusal.NarrowViewport);
});

test('a wide viewport with little memory is refused for its memory', () => {
  expect(deviceRefusalOf({ isPhoneLayout: false, deviceMemoryGigabytes: LITTLE_MEMORY_GIGABYTES })).toBe(DeviceRefusal.LittleMemory);
});

test('a wide viewport with the minimum memory is allowed', () => {
  expect(deviceRefusalOf({ isPhoneLayout: false, deviceMemoryGigabytes: ENOUGH_MEMORY_GIGABYTES })).toBeNull();
});

test('a browser that does not expose its memory is not blocked by it', () => {
  expect(deviceRefusalOf({ isPhoneLayout: false, deviceMemoryGigabytes: null })).toBeNull();
});

test('the viewport is named before the memory when both fail', () => {
  expect(deviceRefusalOf({ isPhoneLayout: true, deviceMemoryGigabytes: LITTLE_MEMORY_GIGABYTES })).toBe(DeviceRefusal.NarrowViewport);
});
