/**
 * HTML خالص پنل بانک و صندوق — بدون I/O.
 * ردیف‌ها و optionها از بیرون به‌صورت رشته تزریق می‌شوند.
 */
export function buildBankPanelHtml(p: {
  totalBalanceHtml: string;
  matchedStatHtml: string;
  unmatchedBankHtml: string;
  balancesRowsHtml: string;
  accountOptsHtml: string;
  ledgerRowsHtml: string;
  todayJalali: string;
  feeOptsHtml: string;
  recvChequeRowsHtml: string;
  payChequeRowsHtml: string;
  reconTotalHtml: string;
  reconMatchedHtml: string;
  reconUnmatchedHtml: string;
  reconBookBalanceHtml: string;
  reconRowsHtml: string;
}): string {
  return `<div class="card bank-panel-card" dir="rtl">
<h3>بانک و صندوق</h3>
<p class="hint">زیرمجموعه‌های استاندارد: مانده حساب‌ها، دفتر بانک، واریز/برداشت، انتقال، کارمزد، چک و مغایرت‌گیری صورت‌حساب.</p>
<div class="form-grid" style="margin:12px 0">
  <div class="stat-card"><b>${p.totalBalanceHtml}</b><span>جمع مانده نقد و بانک</span></div>
  <div class="stat-card"><b>${p.matchedStatHtml}</b><span>ردیف‌های تطبیق‌شده صورت‌حساب</span></div>
  <div class="stat-card"><b>${p.unmatchedBankHtml}</b><span>مانده ردیف‌های تطبیق‌نشده</span></div>
</div>
<div class="table-wrap"><table class="data-table"><thead><tr><th>کد</th><th>حساب</th><th>مانده دفتری</th></tr></thead><tbody>${p.balancesRowsHtml}</tbody></table></div>

<details class="card bank-sub" open><summary>۱) دفتر بانک / صندوق</summary>
<p class="hint">گردش از اسناد حسابداری قطعی حساب انتخاب‌شده.</p>
<div class="form-grid bank-entry-grid">
<label class="field">حساب<select id="bankLedgerAccount">${p.accountOptsHtml}</select></label>
<button type="button" class="btn btn-secondary" id="bankLedgerLoad">نمایش گردش</button>
</div>
<div class="table-wrap" style="margin-top:10px"><table class="data-table"><thead><tr><th>تاریخ</th><th>شماره سند</th><th>شرح</th><th>بدهکار</th><th>بستانکار</th><th>مانده</th></tr></thead><tbody id="bankLedgerBody">${p.ledgerRowsHtml}</tbody></table></div>
</details>

<details class="card bank-sub"><summary>۲) واریز نقد به بانک / برداشت به صندوق</summary>
<p class="hint">جابه‌جایی وجه بین صندوق و بانک با صدور سند حسابداری.</p>
<div class="form-grid bank-entry-grid">
<label class="field">نوع<select id="bankMoveKind"><option value="deposit">واریز نقد به بانک</option><option value="withdraw">برداشت از بانک به صندوق</option></select></label>
<label class="field">شماره<input id="bankMoveNo" placeholder="خودکار یا دستی"></label>
<label class="field">تاریخ<input id="bankMoveDate" placeholder="1405/01/01" value="${p.todayJalali}"></label>
<label class="field">صندوق / تنخواه<select id="bankMoveCash">${p.accountOptsHtml}</select></label>
<label class="field">بانک<select id="bankMoveBank">${p.accountOptsHtml}</select></label>
<label class="field">مبلغ<input id="bankMoveAmount" inputmode="numeric" placeholder="۰"></label>
<label class="field" style="grid-column:1/-1">شرح<input id="bankMoveDesc" placeholder="اختیاری"></label>
</div>
<button type="button" class="btn btn-primary" id="bankMoveSave">ثبت واریز / برداشت</button>
</details>

<details class="card bank-sub"><summary>۳) انتقال بین حساب‌ها</summary>
<div class="form-grid bank-entry-grid">
<label class="field">شماره<input id="bankTransferNo"></label>
<label class="field">تاریخ<input id="bankTransferDate" placeholder="1405/01/01" value="${p.todayJalali}"></label>
<label class="field">از حساب<select id="bankTransferFrom">${p.accountOptsHtml}</select></label>
<label class="field">به حساب<select id="bankTransferTo">${p.accountOptsHtml}</select></label>
<label class="field">مبلغ<input id="bankTransferAmount" inputmode="numeric" placeholder="۰"></label>
<label class="field">کارمزد<input id="bankTransferFee" inputmode="numeric" value="0"></label>
<label class="field">حساب کارمزد<select id="bankTransferFeeAccount"><option value="">اختیاری</option>${p.feeOptsHtml}</select></label>
<input type="hidden" id="bankTransferDescription" value="">
</div>
<button class="btn btn-primary" id="bankTransferSave" type="button">ثبت انتقال</button>
</details>

<details class="card bank-sub"><summary>۴) کارمزد بانکی</summary>
<p class="hint">ثبت کارمزد مستقل (خدمات بانکی، دسته چک و …).</p>
<div class="form-grid bank-entry-grid">
<label class="field">شماره<input id="bankFeeNo"></label>
<label class="field">تاریخ<input id="bankFeeDate" placeholder="1405/01/01" value="${p.todayJalali}"></label>
<label class="field">حساب بانک<select id="bankFeeBank">${p.accountOptsHtml}</select></label>
<label class="field">حساب هزینه کارمزد<select id="bankFeeExpense"><option value="">انتخاب</option>${p.feeOptsHtml}</select></label>
<label class="field">مبلغ<input id="bankFeeAmount" inputmode="numeric" placeholder="۰"></label>
<label class="field" style="grid-column:1/-1">شرح<input id="bankFeeDesc" placeholder="کارمزد خدمات بانکی"></label>
</div>
<button type="button" class="btn btn-primary" id="bankFeeSave">ثبت کارمزد</button>
</details>

<details class="card bank-sub"><summary>۵) چک‌های دریافتی</summary>
<div class="table-wrap"><table class="data-table"><thead><tr><th>تاریخ</th><th>شماره</th><th>طرف</th><th>مبلغ</th><th>شماره چک</th><th>سررسید</th><th>وضعیت</th></tr></thead><tbody>${p.recvChequeRowsHtml}</tbody></table></div>
</details>

<details class="card bank-sub"><summary>۶) چک‌های پرداختی</summary>
<div class="table-wrap"><table class="data-table"><thead><tr><th>تاریخ</th><th>شماره</th><th>طرف</th><th>مبلغ</th><th>شماره چک</th><th>سررسید</th><th>وضعیت</th></tr></thead><tbody>${p.payChequeRowsHtml}</tbody></table></div>
</details>

<details class="card bank-sub"><summary>۷) مغایرت‌گیری صورت‌حساب بانکی</summary>
<p class="hint">ورود فایل CSV بانک (ستون‌ها: date, description, reference, amount, balance) و تطبیق خودکار با دریافت/پرداخت‌ها.</p>
<div class="form-grid" style="margin:8px 0">
  <div class="stat-card"><b>${p.reconTotalHtml}</b><span>کل ردیف‌ها</span></div>
  <div class="stat-card"><b>${p.reconMatchedHtml}</b><span>تطبیق‌شده</span></div>
  <div class="stat-card"><b>${p.reconUnmatchedHtml}</b><span>تطبیق‌نشده</span></div>
  <div class="stat-card"><b>${p.reconBookBalanceHtml}</b><span>مانده دفتری</span></div>
</div>
<div class="form-grid bank-entry-grid">
<label class="field">حساب بانک<select id="bankStatementAccount">${p.accountOptsHtml}</select></label>
<label class="field">فایل CSV<input id="bankStatementFile" type="file" accept=".csv,text/csv"></label>
</div>
<button class="btn btn-secondary" id="bankStatementImport" type="button">ورود و تطبیق خودکار</button>
<div class="table-wrap" style="margin-top:12px"><table class="data-table"><thead><tr><th>تاریخ</th><th>پیگیری</th><th>شرح</th><th>مبلغ</th><th>وضعیت</th></tr></thead><tbody>${p.reconRowsHtml}</tbody></table></div>
</details>
</div>`;
}
