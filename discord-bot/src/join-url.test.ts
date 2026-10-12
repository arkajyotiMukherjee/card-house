import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createReplyContent, joinUrl } from './join-url.ts';

test('join URL is the public origin plus the lobby code', () => {
  assert.equal(
    joinUrl('http://127.0.0.1:5173/', 'AB3D'),
    'http://127.0.0.1:5173/AB3D',
  );
});

test('reply content contains the code and the URL', () => {
  const content = createReplyContent('AB3D', 'http://127.0.0.1:5173/AB3D');
  assert.match(content, /AB3D/);
  assert.match(content, /https?:\/\/\S+/);
});
