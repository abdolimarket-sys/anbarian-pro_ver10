/**
 * HTML خالص بخش دریافت/پرداخت — بدون state و بدون DOM.
 * بخش‌های پویا به‌صورت آرگومان رشته‌ای تزریق می‌شوند.
 */
export function buildCashEntryPanelHtml(input: {
  partyOptionsHtml: string;
  accountOptionsHtml: string;
  cashRowsHtml: string;
}): string {
  const { partyOptionsHtml, accountOptionsHtml, cashRowsHtml } = input;
  return `<div class="card cash-entry-card" dir="rtl" style="margin-top:12px;text-align:right">
<h3>دریافت / پرداخت</h3>
<div class="form-grid cash-entry-grid">
<label class="field">نوع<select id="cashType"><option value="receipt">دریافت</option><option value="payment">پرداخت</option></select></label>
<label class="field">شماره<input id="cashNumber" placeholder="خودکار یا دستی"></label>
<label class="field">طرف حساب<select id="cashParty"><option value="">انتخاب</option>${partyOptionsHtml}</select></label>
<label class="field">روش<select id="cashMethod"><option value="cash">نقدی</option><option value="bank">بانک</option><option value="card">کارت</option><option value="transfer">حواله</option><option value="cheque">چک</option></select></label>
<label class="field">حساب<select id="cashAccount"><option value="">صندوق / بانک</option>${accountOptionsHtml}</select></label>
<label class="field">فاکتور<select id="cashInvoice"><option value="">بدون تخصیص</option></select></label>
<label class="field">تاریخ<input id="cashDate" placeholder="1405/01/01"></label>
<label class="field">مبلغ<input id="cashAmount" inputmode="decimal" placeholder="۰"></label>
<input type="hidden" id="cashAllocation" value="">
<input type="hidden" id="cashDescription" value="">
<label class="field cash-cheque-only" data-cheque-field hidden style="display:none">شماره چک *<input id="cashChequeNumber" autocomplete="off"></label>
<label class="field cash-cheque-only" data-cheque-field hidden style="display:none">بانک *<input id="cashChequeBank" autocomplete="off"></label>
<label class="field cash-cheque-only" data-cheque-field hidden style="display:none">شماره صیادی *<input id="cashChequeAccount" autocomplete="off" placeholder="شناسه صیادی ۱۶ یا ۲۰ رقمی" inputmode="numeric"></label>
<label class="field cash-cheque-only" data-cheque-field hidden style="display:none">سررسید چک *<input id="cashChequeDue" placeholder="1405/01/30" inputmode="numeric" autocomplete="off"></label>
<label class="field cash-cheque-only" data-cheque-field hidden style="display:none">توضیحات چک<input id="cashChequeNote" autocomplete="off"></label>
</div>
<button class="btn btn-primary" id="cashSave" type="button">ثبت</button>
<div class="table-wrap" style="margin-top:14px"><table class="data-table"><thead><tr><th>شماره</th><th>نوع</th><th>طرف</th><th>تاریخ</th><th>مبلغ</th><th>وضعیت</th><th></th></tr></thead><tbody>${cashRowsHtml}</tbody></table></div>
</div>`;
}
