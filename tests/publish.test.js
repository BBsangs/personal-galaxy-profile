import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { profile, portraitMarkup } from '../src/content.js';

test('publishable assets exclude PDFs and public project descriptions exclude personal details', () => {
  const root = new URL('../', import.meta.url);
  const files = readdirSync(new URL('public/', root), { recursive: true });
  assert.ok(files.every(file => !file.toLowerCase().endsWith('.pdf')), 'PDFs in public are copied into the deployed website');
  assert.equal(existsSync(new URL('tests/fixtures/resume-original.txt', root)), false);
  assert.equal(existsSync(new URL('public/portrait.webp', root)), false);
  assert.ok(existsSync(new URL('public/avatar.webp', root)));
  assert.match(portraitMarkup, /avatar\.webp/);
  assert.doesNotMatch(portraitMarkup, /portrait\.webp|data-private-toggle/);
  const descriptions = ['README.md', 'package.json', 'package-lock.json'].map(file => readFileSync(new URL(file, root), 'utf8')).join('\n');
  for (const key of ['name', 'phone', 'wechat', 'email', 'personal', 'salary']) assert.ok(!descriptions.includes(profile[key]), `${key} is not part of the public project description`);
  assert.doesNotMatch(descriptions, /\/Users\//);
  const html = readFileSync(new URL('index.html', root), 'utf8');
  assert.doesNotMatch(html, /resume\.pdf|pdf-reader|mailto:|tel:/);
  for (const key of ['phone', 'email', 'personal', 'salary']) assert.ok(!html.includes(profile[key]));
});
