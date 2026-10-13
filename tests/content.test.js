import test from 'node:test';
import assert from 'node:assert/strict';
import { sections, stations, billboardMarkup, dateDuration, profile, profileSummary } from '../src/content.js';

const normalize = text => text.replace(/<[^>]*>/g, '').replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').normalize('NFKC').replace(/\s/g, '');

test('professional content remains complete and sensitive fields start masked', () => {
  const textResume=normalize(Object.values(sections).map(s=>s.heading+s.body).join(''));
  const billboards=normalize(stations.map(s=>s.title+s.english+billboardMarkup(s)).join(''));
  for(const fragment of ['Remote Camera Controller for Mac', 'WalkmanHelpGuideInstaller for Mac', 'Conntect Transfer for Mac', 'HAP Music Transfer for mac', 'SoftwareUpdateTool for Walkman', 'PMP项目管理认证']) {
    assert.ok(textResume.includes(normalize(fragment)),`Missing original text: ${fragment}`);
    assert.ok(billboards.includes(normalize(fragment)),`Missing from 3D stations: ${fragment}`);
  }
  const rendered = profileSummary + Object.values(sections).map(s=>s.body).join('') + stations.map(billboardMarkup).join('');
  for (const key of ['phone', 'wechat', 'email', 'personal', 'salary']) {
    assert.ok(!rendered.includes(profile[key]), `${key} must not appear before reveal`);
    assert.ok(rendered.includes(`data-private-field="${key}"`));
  }
  assert.doesNotMatch(rendered, /mailto:|tel:|resume\.pdf|data-copy/);
});

test('timeline lengths preserve source dates and use calendar months in China', () => {
  assert.equal(dateDuration('2022.02-2024.11'),'2年9个月');
  assert.equal(dateDuration('2016.03-2019.07'),'3年4个月');
  assert.equal(dateDuration('2017.02-2017.03'),'1个月');
  assert.equal(dateDuration('2019.06-2021.06'),'2年');
  assert.equal(dateDuration('2025.04-至今',new Date('2026-10-13T00:00:00Z')),'1年6个月');
  assert.equal(dateDuration('2025.04-至今',new Date('2025-04-30T16:00:00Z')),'1个月');
  assert.equal(dateDuration('2025.04-2025.04'),'不足1个月');
  assert.equal(dateDuration('2017-2020'),'');
});
