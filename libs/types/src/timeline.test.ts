import { describe, expect, test } from 'vitest';
import { VersionResource, timelineEditsApiPath, topicsRefreshApiPath, versionApiPath, versionCollaborationPath, versionViewPagePath } from './routes';

describe('timeline contracts', () => {
  test('builds version and topics paths with encoded ids', () => {
    expect(versionApiPath({ documentId: 'a/b', sequence: 42 })).toBe('/api/documents/a%2Fb/versions/42');
    expect(versionApiPath({ documentId: 'd1', sequence: 7, resource: VersionResource.Text })).toBe('/api/documents/d1/versions/7/text');
    expect(topicsRefreshApiPath('d1')).toBe('/api/documents/d1/topics/refresh');
    expect(timelineEditsApiPath('d1')).toBe('/api/documents/d1/timeline/edits');
  });
  test('builds the iframe page of a version', () => {
    expect(versionViewPagePath({ documentId: 'd1', sequence: 42 })).toBe('/documents/d1/versions/42/view');
  });
  test('puts each version on its own collaboration endpoint', () => {
    expect(versionCollaborationPath({ documentId: 'a/b', sequence: 42 })).toBe('/collaboration/versions/a%2Fb/42');
  });
});
