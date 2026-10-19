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
const COLOR_SCHEME_QUERIES = ['(prefers-color-scheme: light)', '(prefers-color-scheme: dark)'];
const PUBLIC_ASSETS = ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png', 'og-image.png', 'site.webmanifest', 'robots.txt'];
const MANIFEST_FILE = 'site.webmanifest';
const ROBOTS_FILE = 'robots.txt';
const OPEN_GRAPH_IMAGE = '/og-image.png';

function metaContent({ attribute, key }: { attribute: 'name' | 'property'; key: string }): string {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const element = document.querySelector(`meta[${attribute}="${key}"]`);
  if (!element) throw new Error(`index.html has no meta ${key}`);
  return element.getAttribute('content')!;
}

function linkTags(relation: string): Element[] {
  const document = new DOMParser().parseFromString(html, 'text/html');
  return [...document.querySelectorAll(`link[rel="${relation}"]`)];
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

test('theme-color is declared for light and dark', () => {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const medias = [...document.querySelectorAll('meta[name="theme-color"]')].map((element) => element.getAttribute('media'));
  expect(medias).toEqual(COLOR_SCHEME_QUERIES);
});

test('Open Graph and Twitter tags describe the app with the shared image', () => {
  expect(metaContent({ attribute: 'property', key: 'og:type' })).toBe('website');
  expect(metaContent({ attribute: 'property', key: 'og:title' })).toBe(APP_NAME);
  expect(metaContent({ attribute: 'property', key: 'og:description' })).toBe(APP_DESCRIPTION);
  expect(metaContent({ attribute: 'property', key: 'og:image' })).toBe(OPEN_GRAPH_IMAGE);
  expect(metaContent({ attribute: 'name', key: 'twitter:card' })).toBe('summary_large_image');
});

test('the icons and the manifest are linked', () => {
  const hrefs = ['icon', 'apple-touch-icon', 'manifest'].flatMap((relation) => linkTags(relation).map((tag) => tag.getAttribute('href')));
  expect(hrefs).toEqual(expect.arrayContaining(['/favicon.svg', '/favicon-32.png', '/apple-touch-icon.png', `/${MANIFEST_FILE}`]));
});

test('every public asset exists and index.html or the manifest names it', () => {
  const manifest = publicFile(MANIFEST_FILE);
  PUBLIC_ASSETS.forEach((asset) => {
    expect(existsSync(join(PUBLIC_DIRECTORY, asset))).toBe(true);
  });
  expect(JSON.parse(manifest)).toMatchObject({ name: APP_NAME, display: 'standalone' });
  expect(html).toContain('/og-image.png');
});

test('robots.txt allows the public pages and disallows the private ones', () => {
  const robots = publicFile(ROBOTS_FILE);
  ['/', '/about', '/sign-in'].forEach((path) => expect(robots).toContain(`Allow: ${path}`));
  ['/api/', '/documents/', '/share/', '/print', '/settings', '/admin'].forEach((path) => expect(robots).toContain(`Disallow: ${path}`));
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
