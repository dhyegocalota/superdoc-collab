import {
  DEVICE_FIRST_MIN_MEMORY_GIGABYTES,
  DEVICE_PREPARATION_MIN_MEMORY_GIGABYTES,
  DEVICE_PREVIEW_MIN_MEMORY_GIGABYTES,
} from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { canPreviewOnDevice, DeviceRefusal, deviceRefusalOf, isDeviceFirst } from './device-guard';

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

test('a device that reports the memory for two engines may preview while it converts', () => {
  expect(canPreviewOnDevice(DEVICE_PREVIEW_MIN_MEMORY_GIGABYTES)).toBe(true);
});

test('a device that reports less memory than that converts without a preview', () => {
  expect(canPreviewOnDevice(DEVICE_PREVIEW_MIN_MEMORY_GIGABYTES - 1)).toBe(false);
});

test('a browser that does not expose its memory converts without a preview', () => {
  expect(canPreviewOnDevice(null)).toBe(false);
});

test('a wide device that reports the memory of the Create editor prepares by default', () => {
  expect(isDeviceFirst({ isPhoneLayout: false, deviceMemoryGigabytes: DEVICE_FIRST_MIN_MEMORY_GIGABYTES })).toBe(true);
});

test('a wide device that reports less than that sends the server path by default, though it may opt in', () => {
  const deviceMemoryGigabytes = DEVICE_PREPARATION_MIN_MEMORY_GIGABYTES;
  expect(isDeviceFirst({ isPhoneLayout: false, deviceMemoryGigabytes })).toBe(false);
  expect(deviceRefusalOf({ isPhoneLayout: false, deviceMemoryGigabytes })).toBeNull();
});

test('a browser that does not expose its memory sends the server path by default', () => {
  expect(isDeviceFirst({ isPhoneLayout: false, deviceMemoryGigabytes: null })).toBe(false);
});

test('a phone layout sends the server path by default whatever its memory', () => {
  expect(isDeviceFirst({ isPhoneLayout: true, deviceMemoryGigabytes: DEVICE_FIRST_MIN_MEMORY_GIGABYTES })).toBe(false);
});
