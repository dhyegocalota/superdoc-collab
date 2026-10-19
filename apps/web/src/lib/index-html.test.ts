import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import {
  AGPL_LICENSE_URL,
  APP_DESCRIPTION,
  AUTHOR_NAME,
  AUTHOR_URL,
  REPOSITORY_URL,
  SUPERDOC_NAME,
  SUPERDOC_URL,
} from '../features/about/about-copy';
import html from '../../index.html?raw';
import { APP_NAME } from './app-copy';

const PUBLIC_DIRECTORY = join(__dirname, '..', '..', 'public');
const JSON_LD_PATTERN = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/;
const PUBLIC_ASSETS = [
  'favicon.svg',
  'favicon.ico',
  'favicon-32.png',
  'apple-touch-icon.png',
  'og-image.png',
  'site.webmanifest',
  'robots.txt',
];
const ICO_HEADER_LENGTH = 6;
const ICO_ENTRY_LENGTH = 16;
const ICO_IMAGE_SIZE_OFFSET = 14;
const PNG_COLOR_TYPE_OFFSET = 25;
const PNG_COLOR_TYPE_TRUECOLOR = 2;
const MANIFEST_FILE = 'site.webmanifest';
const OPEN_GRAPH_IMAGE = '/og-image.png';

function metaContent({ attribute, key }: { attribute: 'name' | 'property'; key: string }): string {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const element = document.querySelector(`meta[${attribute}="${key}"]`);
  if (!element) throw new Error(`index.html has no meta ${key}`);
  return element.getAttribute('content')!;
}

function jsonLd(): Record<string, unknown> {
  const match = JSON_LD_PATTERN.exec(html);
  if (!match) throw new Error('index.html has no JSON-LD');
  return JSON.parse(match[1]!);
}

function publicFile(name: string): string {
  return readFileSync(join(PUBLIC_DIRECTORY, name), 'utf8');
}

test('the fallback title and the description name the app', () => {
  expect(html).toContain(`<title>${APP_NAME}</title>`);
  expect(metaContent({ attribute: 'name', key: 'description' })).toBe(APP_DESCRIPTION);
  expect(metaContent({ attribute: 'name', key: 'application-name' })).toBe(APP_NAME);
});

test('Open Graph and Twitter tags describe the app with the shared image', () => {
  expect(metaContent({ attribute: 'property', key: 'og:type' })).toBe('website');
  expect(metaContent({ attribute: 'property', key: 'og:title' })).toBe(APP_NAME);
  expect(metaContent({ attribute: 'property', key: 'og:description' })).toBe(APP_DESCRIPTION);
  expect(metaContent({ attribute: 'property', key: 'og:image' })).toBe(OPEN_GRAPH_IMAGE);
  expect(metaContent({ attribute: 'name', key: 'twitter:card' })).toBe('summary_large_image');
});

test('every public asset exists and index.html or the manifest names it', () => {
  const manifest = publicFile(MANIFEST_FILE);
  PUBLIC_ASSETS.forEach((asset) => {
    expect(existsSync(join(PUBLIC_DIRECTORY, asset))).toBe(true);
  });
  expect(JSON.parse(manifest)).toMatchObject({ name: APP_NAME, display: 'standalone' });
  expect(html).toContain('/og-image.png');
});

test('the JSON-LD is a SoftwareApplication that matches the About copy', () => {
  expect(jsonLd()).toMatchObject({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: APP_NAME,
    description: APP_DESCRIPTION,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    author: { '@type': 'Person', name: AUTHOR_NAME, url: AUTHOR_URL },
    license: AGPL_LICENSE_URL,
    codeRepository: REPOSITORY_URL,
    isBasedOn: { '@type': 'SoftwareApplication', name: SUPERDOC_NAME, url: SUPERDOC_URL },
    offers: { '@type': 'Offer', price: '0' },
  });
});

test('favicon.ico is an ICO container holding one 32 px PNG', () => {
  const icon = readFileSync(join(PUBLIC_DIRECTORY, 'favicon.ico'));
  const png = readFileSync(join(PUBLIC_DIRECTORY, 'favicon-32.png'));
  expect([...icon.subarray(0, ICO_HEADER_LENGTH)]).toEqual([0, 0, 1, 0, 1, 0]);
  expect(icon.readUInt32LE(ICO_IMAGE_SIZE_OFFSET)).toBe(png.length);
  expect(icon.subarray(ICO_HEADER_LENGTH + ICO_ENTRY_LENGTH).equals(png)).toBe(true);
});

test('the apple touch icon has no alpha channel, so iOS paints no black corners', () => {
  const png = readFileSync(join(PUBLIC_DIRECTORY, 'apple-touch-icon.png'));
  expect(png.readUInt8(PNG_COLOR_TYPE_OFFSET)).toBe(PNG_COLOR_TYPE_TRUECOLOR);
});
