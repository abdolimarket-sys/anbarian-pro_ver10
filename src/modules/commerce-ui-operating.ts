/**
 * HTML خالص پنل هزینه/درآمد عملیاتی — بدون state و بدون I/O.
 */
export function buildOperatingPanelHtml(input: {
  currencyLabel: string;
  todayJalali: string;
  expenseOptsHtml: string;
  incomeOptsHtml: string;
  cashOptsHtml: string;
  periodOptsHtml: string;
  partyOptsHtml: string;
  recentRowsHtml: string;
}): string {
  const {
    currencyLabel,
    todayJalali,
    expenseOptsHtml,
    incomeOptsHtml,
    cashOptsHtml,
    periodOptsHtml,
    partyOptsHtml,
    recentRowsHtml,
  } = input;
  return `<div class="card" dir="rtl">
<h3>ثبت هزینه و درآمد</h3>
<p class="hint">برای هزینه‌های متفرقه (اجاره، حقوق، ملزومات و …) و درآمدهای غیر از فاکتور فروش. با ثبت، سند حسابداری قطعی ساخته می‌شود.</p>
<div class="form-grid">
<label class="field">نوع ثبت<select id="opKind"><option value="expense">هزینه</option><option value="income">درآمد</option></select></label>
<label class="field">تاریخ شمسی<input id="opDate" value="${todayJalali}" placeholder="1405/01/01" inputmode="numeric"></label>
<label class="field">سال مالی<select id="opPeriod">${periodOptsHtml || '<option value="">سال مالی باز تعریف نشده</option>'}</select></label>
<label class="field">مبلغ (${currencyLabel})<input id="opAmount" inputmode="decimal" placeholder="۰"></label>
<label class="field" id="opAccountExpenseWrap">حساب هزینه<select id="opExpenseAccount"><option value="">انتخاب حساب هزینه</option>${expenseOptsHtml}</select></label>
<label class="field" id="opAccountIncomeWrap" hidden>حساب درآمد<select id="opIncomeAccount"><option value="">انتخاب حساب درآمد</option>${incomeOptsHtml}</select></label>
<label class="field">از / به صندوق یا بانک<select id="opCashAccount"><option value="">انتخاب حساب</option>${cashOptsHtml}</select></label>
<label class="field">طرف حساب (اختیاری)<select id="opParty"><option value="">بدون طرف حساب</option>${partyOptsHtml}</select></label>
<label class="field" style="grid-column:1/-1">شرح<input id="opDescription" placeholder="مثلاً اجاره فروردین / درآمد اجاره انبار"></label>
</div>
<div class="actions"><button type="button" class="btn btn-primary" id="opSave">ثبت و صدور سند</button></div>
<h4 style="margin-top:20px">آخرین ثبت‌ها</h4>
<div class="table-wrap"><table class="data-table"><thead><tr><th>تاریخ</th><th>نوع</th><th>شماره سند</th><th>حساب</th><th>شرح</th><th>مبلغ</th></tr></thead><tbody>${recentRowsHtml}</tbody></table></div>
</div>`;
}
