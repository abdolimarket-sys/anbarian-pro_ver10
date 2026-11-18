import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPartiesPanelHtml, partyTypeLabel } from '../src/modules/commerce-ui-parties.ts';

const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

test('party panel renderer keeps the selected edit record and safely escapes fields', () => {
  const parties = [
    { id: 'p1', name: '<شرکت الف>', type: 'supplier', phone: '0912', nationalId: '123', address: 'تهران', isActive: true, economicCode: 'E1', registrationNumber: 'R1', postalCode: '111' },
  ];
  const html = buildPartiesPanelHtml(parties, 'p1', escapeHtml);
  assert.match(html, /value="p1"/);
  assert.match(html, /value="&lt;شرکت الف&gt;"/);
  assert.match(html, /value="E1"/);
  assert.match(html, /ذخیره تغییرات/);
  assert.doesNotMatch(html, /<شرکت الف>/);
});

test('party panel renderer keeps empty state and party type labels', () => {
  assert.match(buildPartiesPanelHtml([], null, escapeHtml), /هنوز طرف حسابی ثبت نشده است/);
  assert.equal(partyTypeLabel('both'), 'مشتری و تأمین‌کننده');
});

test('party option builder filters inactive and incompatible party types', async () => {
  const { buildPartyOptions } = await import('../src/modules/commerce-ui-parties.ts');
  const parties = [
    { id: 'c', name: 'مشتری', type: 'customer', isActive: true },
    { id: 's', name: 'تأمین‌کننده', type: 'supplier', isActive: true },
    { id: 'b', name: 'هر دو', type: 'both', isActive: true },
    { id: 'x', name: 'غیرفعال', type: 'customer', isActive: false },
  ];
  const html = buildPartyOptions(parties, 'customer', escapeHtml);
  assert.match(html, /value="c"/);
  assert.match(html, /value="b"/);
  assert.doesNotMatch(html, /value="s"|value="x"/);
});
