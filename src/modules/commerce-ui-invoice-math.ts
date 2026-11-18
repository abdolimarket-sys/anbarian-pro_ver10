/** محاسبات خالص تعداد/واحد و تخفیف پیشنهادی ردیف فاکتور. */
import type { Product } from '../types';
import { digits } from './commerce-ui-shared';

export function invoiceLineEnteredQty(row:HTMLElement):number{
  return Number(digits(row.querySelector<HTMLInputElement>('[data-line-qty]')?.value||'0').replace(',','.'))||0;
}

export function invoiceLineUnitFactor(row:HTMLElement,products:readonly Product[]):number{
  const productId=row.querySelector<HTMLInputElement>('[data-line-product]')?.value||'';
  const product=products.find(p=>p.id===productId);
  const fromProduct=Math.max(1,Number(product?.unitFactor)||0);
  const fromRow=Math.max(1,Number(row.querySelector<HTMLInputElement>('[data-line-unit-factor]')?.value)||1);
  return fromProduct>1?fromProduct:fromRow;
}

export function invoiceLineBaseQty(row:HTMLElement,products:readonly Product[]):number{
  const quantity=invoiceLineEnteredQty(row);
  const mode=row.querySelector<HTMLSelectElement>('[data-line-unit-mode]')?.value;
  return mode==='pack'?quantity*invoiceLineUnitFactor(row,products):quantity;
}

export function suggestedProductDiscountRial(product:Product,baseQuantity:number):number{
  const consumer=Number(product.consumerPrice)||0;
  const salePrice=Number(product.price)||0;
  const percent=Number(product.sellDiscountPercent)||0;
  let discountPerBaseUnit=0;
  if(percent>0&&consumer>0)discountPerBaseUnit=Math.round(consumer*percent/100);
  else if(consumer>0&&salePrice>0&&consumer>salePrice)discountPerBaseUnit=consumer-salePrice;
  return Math.max(0,Math.round(discountPerBaseUnit*Math.max(0,baseQuantity)));
}
