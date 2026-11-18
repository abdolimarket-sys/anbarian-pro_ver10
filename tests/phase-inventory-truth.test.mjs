import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * قرارداد منبع حقیقت موجودی: balances مبنا است؛ کارت فقط بازتاب است.
 */
function applyCostingBalancesToProducts(costing, products) {
  let updated = 0;
  for (const b of costing.balances) {
    const p = products.find((x) => x.id === b.productId);
    if (!p) continue;
    const truth = b.qtyMilli / 1000;
    if (Math.abs((p.systemQty || 0) - truth) >= 0.000001) {
      p.systemQty = truth;
      updated++;
    }
  }
  return updated;
}

describe('inventory truth contract', () => {
  it('card qty follows balances not the other way around', () => {
    const products = [
      { id: 'p1', systemQty: 10 },
      { id: 'p2', systemQty: 0 },
    ];
    const costing = {
      balances: [
        { productId: 'p1', warehouse: 'انبار اصلی', qtyMilli: 7000, valueRial: 0, averageUnitCostRial: 0 },
        { productId: 'p2', warehouse: 'انبار اصلی', qtyMilli: 2500, valueRial: 0, averageUnitCostRial: 0 },
      ],
    };
    const updated = applyCostingBalancesToProducts(costing, products);
    assert.equal(updated, 2);
    assert.equal(products[0].systemQty, 7);
    assert.equal(products[1].systemQty, 2.5);
  });

  it('no write when already aligned', () => {
    const products = [{ id: 'p1', systemQty: 3 }];
    const costing = {
      balances: [
        { productId: 'p1', warehouse: 'انبار اصلی', qtyMilli: 3000, valueRial: 0, averageUnitCostRial: 0 },
      ],
    };
    assert.equal(applyCostingBalancesToProducts(costing, products), 0);
  });
});
