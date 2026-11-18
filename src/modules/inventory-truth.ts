/**
 * منبع حقیقت موجودی انبار
 * ---------------------------------------------------------------------------
 * اصل معماری:
 *   - تعداد و ارزش مالی موجودی از `InventoryCostData.balances` خوانده می‌شود.
 *   - `product.systemQty` / `stockByWarehouse` فقط **کش نمایشی/عملیاتی** است
 *     و هرگز برای تصمیم حسابداری به‌تنهایی مبنا نیست.
 *   - پس از هر تغییر costing و هنگام boot، کارت کالا از balances همگام می‌شود.
 */

import { products, save as saveAppState, flushSave, logAudit } from './state';
import {
  loadInventoryCostData,
  saveInventoryCostData,
  type InventoryCostData,
  getCostBalance,
  receiveStock,
  issueStock,
} from './inventory-costing';
import {
  ensureProductStock,
  getWarehouseQty,
  setWarehouseQty,
  warehouseName,
  DEFAULT_WAREHOUSE,
} from './warehouse-stock';

export type StockTruthSnapshot = {
  productId: string;
  warehouse: string;
  qty: number;
  valueRial: number;
  averageUnitCostRial: number;
  cardQty: number;
  diverged: boolean;
};

/** موجودی حقیقی یک کالا از balances (نه از کارت کالا) */
export function getTruthQty(
  costing: InventoryCostData,
  productId: string,
  warehouse?: string,
): number {
  const wh = warehouseName(warehouse || DEFAULT_WAREHOUSE);
  return getCostBalance(costing, productId, wh).qtyMilli / 1000;
}

export function getTruthBalance(
  costing: InventoryCostData,
  productId: string,
  warehouse?: string,
) {
  const wh = warehouseName(warehouse || DEFAULT_WAREHOUSE);
  return getCostBalance(costing, productId, wh);
}

/**
 * همگام‌سازی کارت کالا از balances.
 * @returns تعداد کالاهایی که اصلاح شدند
 */
export function applyCostingBalancesToProducts(
  costing: InventoryCostData,
  productIds?: string[],
): { updated: number; productIds: string[]; divergences: StockTruthSnapshot[] } {
  const targets = new Set<string>();
  if (productIds?.length) {
    for (const id of productIds) targets.add(id);
  } else {
    for (const b of costing.balances) targets.add(b.productId);
  }

  let updated = 0;
  const changed: string[] = [];
  const divergences: StockTruthSnapshot[] = [];

  for (const productId of targets) {
    const p = products.find((x) => x.id === productId);
    if (!p) continue;
    ensureProductStock(p);

    // balances می‌تواند چند انبار داشته باشد: تعداد و ارزش جمع می‌شوند؛
    // میانگین باید موزون باشد نه میانگینِ آخرین ردیف.
    const rows = costing.balances.filter((b) => b.productId === productId);
    if (!rows.length) continue;

    let totalMilli = 0;
    let totalValueRial = 0;
    let primaryWh = warehouseName(p.warehouse || DEFAULT_WAREHOUSE);
    let primaryAbs = -1;
    for (const b of rows) {
      totalMilli += b.qtyMilli;
      totalValueRial += Math.max(0, Number(b.valueRial) || 0);
      const absQty = Math.abs(b.qtyMilli);
      // انبار اصلی = بزرگ‌ترین موجودی مطلق؛ در تساوی ترجیح با انبار کارت کالا
      if (
        absQty > primaryAbs
        || (absQty === primaryAbs && warehouseName(b.warehouse) === warehouseName(p.warehouse || DEFAULT_WAREHOUSE))
      ) {
        primaryAbs = absQty;
        primaryWh = warehouseName(b.warehouse);
      }
    }
    if (primaryAbs < 0) primaryWh = warehouseName(p.warehouse || DEFAULT_WAREHOUSE);

    const truthQty = totalMilli / 1000;
    // میانگین موزون روی کل انبارها
    const avg =
      totalMilli > 0 ? Math.round((totalValueRial * 1000) / totalMilli) : 0;
    const cardQty = getWarehouseQty(p, primaryWh);
    const diverged = Math.abs(cardQty - truthQty) >= 0.000001;

    if (diverged) {
      setWarehouseQty(p, primaryWh, truthQty);
      updated += 1;
      changed.push(productId);
      divergences.push({
        productId,
        warehouse: primaryWh,
        qty: truthQty,
        valueRial: totalValueRial,
        averageUnitCostRial: avg,
        cardQty,
        diverged: true,
      });
    }
  }

  return { updated, productIds: changed, divergences };
}

/** بارگذاری costing + همگام‌سازی کامل کارت‌ها + ذخیره در صورت نیاز */
export async function syncProductCardsFromCostingTruth(
  productIds?: string[],
): Promise<{ updated: number; productIds: string[] }> {
  const costing = await loadInventoryCostData();
  const result = applyCostingBalancesToProducts(costing, productIds);
  if (result.updated > 0) {
    saveAppState(true);
    await flushSave();
    logAudit('stock_synced_from_costing_truth', {
      updated: result.updated,
      productIds: result.productIds,
    });
  }
  return { updated: result.updated, productIds: result.productIds };
}

/**
 * بررسی سریع ناسازگاری بدون نوشتن — برای تشخیص/گزارش.
 */

/**
 * همگام‌سازی دفتر بهای تمام‌شده با موجودی عملیاتی (systemQty).
 * وقتی کاربر systemQty را دستی ویرایش می‌کند یا شمارش را به سیستم اعمال می‌کند،
 * balances/layers/movements باید با کارت کالا یکی شوند؛ در غیر این صورت گزارش تطبیق و COGS منحرف می‌شود.
 */
export async function syncOperationalQtyToCosting(
  productId: string,
  newQty: number,
  opts?: { unitCostRial?: number; productName?: string; allowNegative?: boolean },
): Promise<{ adjusted: boolean; beforeMilli: number; afterMilli: number }> {
  const costing = await loadInventoryCostData();
  const wh = DEFAULT_WAREHOUSE;
  const b = getCostBalance(costing, productId, wh);
  const afterMilli = Math.round((Number.isFinite(newQty) ? Number(newQty) : 0) * 1000);
  const beforeMilli = b.qtyMilli;
  if (afterMilli === beforeMilli) {
    return { adjusted: false, beforeMilli, afterMilli };
  }

  const unitHint = Math.max(
    0,
    Math.round(Number(opts?.unitCostRial) || b.averageUnitCostRial || 0),
  );
  const delta = afterMilli - beforeMilli;
  const sourceDocumentId = `qty-sync:${productId}:${Date.now().toString(36)}`;
  const date = new Date().toLocaleDateString('fa-IR-u-nu-latn').replace(/-/g, '/');
  // تاریخ شمسی ساده؛ اگر فرمت دستگاه متفاوت بود از ISO date بخش روز استفاده می‌کنیم
  const jalaliGuess = date.includes('/') ? date : new Date().toISOString().slice(0, 10).replace(/-/g, '/');

  if (delta > 0) {
    // افزایش موجودی: با بهای میانگین/راهنما وارد لایه می‌شود
    const unitCost = unitHint > 0 ? unitHint : 0;
    receiveStock(costing, {
      productId,
      warehouse: wh,
      qtyMilli: delta,
      unitCostRial: unitCost > 0 ? unitCost : 0,
      date: jalaliGuess,
      sourceDocumentId,
    });
    // receiveStock rejects unitCost invalid if !safe - unitCost 0 might throw
  } else {
    issueStock(costing, {
      productId,
      warehouse: wh,
      qtyMilli: -delta,
      date: jalaliGuess,
      sourceDocumentId,
      method: 'moving-average',
      allowNegative: opts?.allowNegative !== false,
      productName: opts?.productName,
    });
  }

  await saveInventoryCostData(costing);
  logAudit('stock_qty_synced_to_costing', {
    productId,
    beforeMilli,
    afterMilli,
    deltaMilli: afterMilli - beforeMilli,
  });
  return { adjusted: true, beforeMilli, afterMilli };
}

/**
 * همگام‌سازی دسته‌ای چند کالا (مثلاً بعد از اعمال شمارش به سیستم).
 */
export async function syncManyOperationalQtyToCosting(
  items: Array<{ productId: string; qty: number; unitCostRial?: number; productName?: string }>,
): Promise<{ updated: number }> {
  let updated = 0;
  for (const item of items) {
    const r = await syncOperationalQtyToCosting(item.productId, item.qty, {
      unitCostRial: item.unitCostRial,
      productName: item.productName,
    });
    if (r.adjusted) updated += 1;
  }
  return { updated };
}

export function listStockDivergences(
  costing: InventoryCostData,
): StockTruthSnapshot[] {
  const out: StockTruthSnapshot[] = [];

  // مدل عملیاتی فعلی تک‌انباره است؛ بنابراین باید دقیقاً مانند
  // applyCostingBalancesToProducts مانده‌های همه ردیف‌های هر کالا تجمیع شوند.
  // مقایسه هر ردیف جداگانه با systemQty باعث هشدار دائمی برای کالاهایی
  // می‌شد که بیش از یک ردیف مانده (مثلاً داده‌های مهاجرتی چند انباره) دارند.
  const byProduct = new Map<string, typeof costing.balances>();
  for (const balance of costing.balances) {
    const rows = byProduct.get(balance.productId) || [];
    rows.push(balance);
    byProduct.set(balance.productId, rows);
  }

  for (const [productId, rows] of byProduct) {
    const p = products.find((x) => x.id === productId);
    if (!p) continue;
    ensureProductStock(p);

    const totalMilli = rows.reduce((sum, row) => sum + (Number(row.qtyMilli) || 0), 0);
    const totalValueRial = rows.reduce(
      (sum, row) => sum + Math.max(0, Number(row.valueRial) || 0),
      0,
    );
    const truthQty = totalMilli / 1000;
    const cardQty = getWarehouseQty(p, p.warehouse || DEFAULT_WAREHOUSE);

    if (Math.abs(cardQty - truthQty) >= 0.000001) {
      // فقط برای نمایش، انبار دارای بزرگ‌ترین مانده مطلق انتخاب می‌شود.
      const primary = rows.reduce((best, row) =>
        Math.abs(row.qtyMilli) > Math.abs(best.qtyMilli) ? row : best,
      rows[0]);
      out.push({
        productId,
        warehouse: warehouseName(primary.warehouse),
        qty: truthQty,
        valueRial: totalValueRial,
        averageUnitCostRial: totalMilli > 0
          ? Math.round((totalValueRial * 1000) / totalMilli)
          : 0,
        cardQty,
        diverged: true,
      });
    }
  }
  return out;
}
