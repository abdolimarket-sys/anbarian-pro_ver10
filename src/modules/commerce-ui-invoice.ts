/**
 * HTML خالص بخش فاکتور فروش/خرید — بدون state و بدون I/O.
 * شناسه‌های کنترل باید با bind موجود در accounting-commerce-ui هم‌خوان بمانند.
 */
export function buildInvoiceSectionHtml(p: {
  sectionMode: 'sale' | 'purchase';
  invoiceType: string;
  typeTitle: string;
  invoiceNumber: string;
  partyLabel: string;
  partyOptionsHtml: string;
  todayJalali: string;
  taxDetailsHtml: string;
  landedCostsHtml: string;
  summaryExtraHtml: string;
  profitPanelHtml: string;
  settleHidden: boolean;
  printInternalBtnHtml: string;
  partyColumnLabel: string;
  invoiceRowsHtml: string;
  invoiceListFooterHtml: string;
}): string {
  return `<header class="commerce-page-header"><div><h2>${p.typeTitle}</h2></div><span class="commerce-page-chip">${p.sectionMode === 'sale' ? 'فروش' : 'خرید'}</span></header>
  <div class="card commerce-invoice-card" style="margin-top:12px">
<h3 id="invoiceFormTitle">${p.typeTitle}</h3>
<div class="form-grid invoice-header-grid">
<input type="hidden" id="invoiceType" value="${p.invoiceType}">
<label class="field">شماره<input id="invoiceNumber" value="${p.invoiceNumber}" placeholder="شماره" autocomplete="off"></label>
<label class="field">${p.partyLabel}
<div style="display:flex;gap:6px;align-items:stretch">
<select id="invoiceParty" style="flex:1"><option value="">انتخاب</option>${p.partyOptionsHtml}</select>
<button type="button" class="btn btn-sm btn-secondary" id="invoiceAddParty" title="اگر شخص در فهرست نیست، اینجا تعریف کنید">+ شخص</button>
</div>
</label>
<label class="field">تاریخ<div class="invoice-jalali-date"><input id="invoiceDate" value="${p.todayJalali}" placeholder="1405/01/01" autocomplete="off" inputmode="numeric"><button type="button" class="btn btn-secondary jalali-cal-btn" id="invoiceJalaliCalendar" aria-label="تقویم" title="تقویم شمسی">▦</button><div id="invoiceJalaliCalendarPanel" class="invoice-jalali-calendar" hidden></div></div></label>
<input type="hidden" id="invoicePaymentTerms" value=""><select hidden aria-hidden="true"></select><input type="hidden" id="invoiceDescription">
</div>

<div class="invoice-items-block">
<div class="invoice-items-toolbar">
<b>اقلام</b>
<button type="button" class="btn btn-sm btn-secondary" id="invoiceOpenItems">برگه اقلام</button>
</div>
<div id="invoiceItemsSummary" class="hint" style="margin:4px 0 8px"></div>
<div id="invoiceItemsPlaceholder" hidden>
<div class="commerce-lines-head"><b>اقلام</b></div>
<div class="invoice-product-tools invoice-product-tools-compact">
<div class="invoice-live-search"><label class="field">کالا / بارکد<input id="invoiceProductSearch" autocomplete="off" placeholder="نام یا بارکد"></label><div id="invoiceProductSuggestions" class="invoice-product-suggestions" role="listbox" hidden></div></div>
<button class="btn btn-secondary" id="invoiceProductAdd" type="button">افزودن</button>
<button class="btn btn-primary" id="invoiceScanOpen" type="button">اسکن</button>
<input type="hidden" id="invoiceBarcodeInput">
<small id="invoiceScanStatus" class="hint" role="status" aria-live="polite"></small>
</div>
<div id="commerceInvoiceLines"></div>
<datalist id="anbarin-invoice-unit-list">
  <option value="عدد"></option>
  <option value="کیلوگرم"></option>
  <option value="گرم"></option>
  <option value="لیتر"></option>
  <option value="میلی‌لیتر"></option>
  <option value="متر"></option>
  <option value="سانتی‌متر"></option>
  <option value="مترمربع"></option>
  <option value="جفت"></option>
  <option value="دست"></option>
  <option value="شاخه"></option>
  <option value="رول"></option>
  <option value="قوطی"></option>
  <option value="بسته"></option>
  <option value="کارتن"></option>
  <option value="جعبه"></option>
  <option value="گونی"></option>
  <option value="پالت"></option>
</datalist>
<button class="btn btn-sm btn-secondary" id="invoiceAddLine" type="button">ردیف خالی</button>
</div>
</div>

${p.taxDetailsHtml}
${p.landedCostsHtml}

<div class="commerce-invoice-summary">
<div><span>جمع</span><b id="invoiceNetPreview">—</b></div>
<div><span>مالیات</span><b id="invoiceTaxPreview">—</b></div>
${p.summaryExtraHtml}
<div class="grand"><span>مبلغ نهایی</span><b id="invoiceGrossPreview">—</b></div>
</div>
${p.profitPanelHtml}
<div class="invoice-action-bar">
<button class="btn btn-secondary" id="invoiceSave" type="button">پیش‌نویس</button>
<button class="btn btn-primary" id="invoiceSettle" type="button" ${p.settleHidden ? 'hidden' : ''}>تسویه</button>
<button class="btn btn-secondary" id="invoicePrint" type="button" title="چاپ مشتری (بدون سود)">چاپ مشتری</button>
${p.printInternalBtnHtml}
<button class="btn btn-secondary" id="invoiceShare" type="button" title="اشتراک در پیام‌رسان (بدون سود)">اشتراک</button>
<button class="btn btn-secondary" id="invoiceCancelEdit" type="button" hidden>لغو</button>
</div>
<div class="invoice-registered-block">
<h4 class="invoice-registered-title">فاکتورهای ثبت‌شده</h4>
<div class="table-wrap invoice-list-wrap"><table class="data-table invoice-list-table"><thead><tr><th>شماره</th><th>${p.partyColumnLabel}</th><th>تاریخ</th><th>مبلغ</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>${p.invoiceRowsHtml}</tbody></table></div>
${p.invoiceListFooterHtml}
</div></div>`;
}

/** بلوک مالیات استاندارد فاکتور */
export function buildInvoiceTaxDetailsHtml(): string {
  return `<details class="card invoice-details-panel" style="margin-top:14px"><summary>مالیات</summary>
<div class="form-grid invoice-details-grid" style="margin-top:12px">
<label class="field">نرخ مالیات (%)<input id="invoiceTaxRate" inputmode="decimal" value="0" placeholder="۰"></label>
<label class="field">مبلغ مالیات<input id="invoiceTax" inputmode="numeric" value="0"></label>
<label class="field">توضیحات چاپی<textarea id="invoiceNotes" rows="2" placeholder="اختیاری"></textarea></label>
</div>
<input type="hidden" id="invoiceDescriptionVisible" value="">
<input type="hidden" id="invoiceDueDate" value=""><div id="invoicePaymentRows" hidden></div><div id="invoicePaymentSummary" class="hint" hidden></div>
</details>`;
}

export function buildInvoiceLandedCostsHtml(): string {
  return `<details class="card invoice-details-panel" style="margin-top:10px" open><summary>هزینه‌های جانبی خرید (Landed Cost)</summary>
<div class="form-grid invoice-details-grid" style="margin-top:12px">
<label class="field">حمل و نقل<input id="invoiceLandedFreight" inputmode="numeric" value="0" placeholder="۰"></label>
<label class="field">گمرک و ترخیص<input id="invoiceLandedCustoms" inputmode="numeric" value="0" placeholder="۰"></label>
<label class="field">بیمه<input id="invoiceLandedInsurance" inputmode="numeric" value="0" placeholder="۰"></label>
<label class="field">سایر هزینه‌ها<input id="invoiceLandedOther" inputmode="numeric" value="0" placeholder="۰"></label>
<label class="field" style="grid-column:1/-1">شرح هزینه جانبی<input id="invoiceLandedNote" placeholder="مثلاً باربری مسیر تهران — اختیاری"></label>
</div>
<p class="hint" style="margin:8px 0 0">این مبالغ طبق استاندارد به <b>بهای تمام‌شده موجودی</b> اضافه می‌شوند (نه هزینه دوره). تخصیص به‌نسبت مبلغ ردیف‌های کالا انجام می‌شود. بدهی در حساب «هزینه‌های جانبی خرید پرداختنی» ثبت می‌گردد.</p>
<div class="hint" id="invoiceLandedTotalPreview" style="margin-top:6px">جمع هزینه جانبی: —</div>
</details>`;
}

export function buildInvoiceInternalProfitPanelHtml(): string {
  return `<div id="invoiceInternalProfitPanel" class="commerce-invoice-summary invoice-internal-profit-panel" style="margin-top:8px;border:1px dashed var(--border,#b9ddc2);background:var(--primary-soft,#e5f3e8)">
<div><span>بهای تمام‌شده (داخلی)</span><b id="invoiceCogsPreview">—</b></div>
<div><span>سود ناخالص (داخلی)</span><b id="invoiceGrossProfitPreview">—</b></div>
<div class="grand"><span>حاشیه سود</span><b id="invoiceMarginPreview">—</b></div>
<p class="hint" style="grid-column:1/-1;margin:4px 0 0">فقط برای کاربر داخلی — در چاپ مشتری و اشتراک نمایش داده نمی‌شود. برآورد بر اساس بهای موجودی فعلی است.</p>
</div>`;
}

