import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const schemaPath = new URL('../src/modules/taxpayer-schema-v79.ts', import.meta.url).pathname;
const runtime = `import { validateV79SalePayload } from ${JSON.stringify(schemaPath)};
const base = ${JSON.stringify({header:{inty:1,inp:1,ins:1,tins:'1234567890123',indatim:1780000000000,setm:3,tprdis:100,tdis:0,tadis:100,tbill:120,tvam:20,todam:0,cap:50,insp:50,tvop:10},body:[{sstid:'1234567890123',am:1,fee:100,prdis:100,dis:0,adis:100,vra:20,vam:20,tsstam:120,cop:60,vop:10}],payments:[{pmt:3,pv:60}]})};
const run = (values, omitTvop=false) => { const p=structuredClone(base); p.payments=values.map(pv=>({pmt:3,pv})); if(omitTvop) delete p.header.tvop; return validateV79SalePayload(p).map(x=>x.code); };
process.stdout.write(JSON.stringify({valid:run([60]), mismatch:run([50]), multi:run([25,35]), missingVat:run([60],true)}));`;
const child = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', runtime], { encoding: 'utf8' });
if (child.status !== 0) throw new Error(child.stderr || child.stdout || 'TypeScript runtime validation failed');
const results = JSON.parse(child.stdout);

test('mixed settlement accepts transaction payments equal to cap plus VAT payment share', () => {
  assert.equal(results.valid.includes('cash_payment_total_mismatch'), false);
});

test('mixed settlement rejects payment totals that do not reconcile to cap plus tvop', () => {
  assert.ok(results.mismatch.includes('cash_payment_total_mismatch'));
});

test('mixed settlement aggregates multiple cash transactions before reconciliation', () => {
  assert.equal(results.multi.includes('cash_payment_total_mismatch'), false);
});

test('mixed settlement requires the VAT payment share to reconcile payment transactions', () => {
  assert.ok(results.missingVat.includes('cash_payment_vat_share_required'));
});
