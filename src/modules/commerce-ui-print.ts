import type { CommercialInvoice, AccountingParty } from './commerce-api';

export interface ThermalBusinessProfile {
  name:string; phone:string; address:string; logo:string;
}
export interface ThermalFormat {
  fa:(value:number)=>string;
  esc:(value:string)=>string;
  money:(rial:number)=>string;
  invoiceTypeTitle:(type:CommercialInvoice['type'])=>string;
  isSaleInvoiceType:(type:CommercialInvoice['type'])=>boolean;
}

export function buildThermalInvoiceHtml(invoice:CommercialInvoice,party:AccountingParty,biz:ThermalBusinessProfile,widthMm:58|80,format:ThermalFormat):{title:string;html:string;text:string}|null {
  const title=`فاکتور ${format.invoiceTypeTitle(invoice.type)} ${invoice.number}`;
  const discountTotal=invoice.lines.reduce((sum,line)=>sum+Math.max(0,Number(line.discountRial)||0),0);
  const lineRows=invoice.lines.map((line,index)=>`
    <tr>
      <td class="idx">${format.fa(index+1)}</td>
      <td class="desc">${format.esc(line.description)}</td>
      <td class="qty">${format.fa(line.quantityMilli/1000)}<small>${format.esc(line.unit||'عدد')}</small></td>
      <td class="unit-price">${format.money(line.unitPriceRial)}</td>
      <td class="amount-cell">
        <b>${format.money(line.totalRial)}</b>
        <small>${(line.discountRial||0)>0?`تخفیف: ${format.money(line.discountRial||0)}`:'تخفیف: —'}</small>
      </td>
    </tr>`).join('');
  const logoHtml=biz.logo?`<img class="store-logo" src="${biz.logo.replace(/"/g,'')}" alt="لوگوی فروشگاه" />`:'';
  const buyerTitle=format.isSaleInvoiceType(invoice.type)?'مشخصات خریدار':'مشخصات فروشنده';
  const paymentLabels=(invoice.paymentParts||[]).map(x=>{
    const label=x.method==='cash'?'نقدی':x.method==='card'?'کارت':x.method==='cheque'?`چک ${x.chequeNumber||''}`:'اعتباری';
    return `<div class="detail-cell"><span>${format.esc(label)}</span><b>${format.money(x.amountRial)}</b></div>`;
  }).join('');
  const html=`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${format.esc(title)}</title><style>
@page{size:${widthMm}mm auto;margin:${widthMm===58?'1.2':'1.8'}mm}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff;color:#111;font-family:Tahoma,Arial,sans-serif;direction:rtl}
body{width:${widthMm-3}mm;max-width:${widthMm-3}mm;padding:${widthMm===58?'1':'1.4'}mm;font-size:${widthMm===58?'8':'8.8'}px;line-height:1.28}
.store-head{display:flex;align-items:center;justify-content:center;gap:7px;padding:2px 0 5px;border-bottom:1px solid #222}
.store-logo{width:${widthMm===58?'13':'17'}mm;height:${widthMm===58?'13':'17'}mm;object-fit:contain;flex:0 0 auto}
.store-name{font-size:${widthMm===58?'11':'14'}px;font-weight:900;text-align:center;overflow-wrap:anywhere}
.store-meta{display:flex;justify-content:center;gap:5px;flex-wrap:wrap;font-size:${widthMm===58?'7':'8'}px;margin-top:2px;color:#333}
.doc-head{display:flex;justify-content:space-between;gap:5px;padding:4px 0;border-bottom:1px dashed #555;font-weight:700}
.doc-head span{min-width:0;overflow-wrap:anywhere}
.party-card{border:1px solid #555;border-radius:5px;padding:3px;margin:3px 0}
.section-title{font-weight:900;font-size:${widthMm===58?'8':'9'}px;margin-bottom:4px}
.party-grid{display:grid;grid-template-columns:1fr 1fr;gap:3px 6px}
.party-field{min-width:0;display:flex;gap:3px;align-items:flex-start}
.party-field .label{color:#555;white-space:nowrap}
.party-field b{min-width:0;overflow-wrap:anywhere;font-weight:700}
.party-field.full{grid-column:1/-1}
table{width:100%;border-collapse:collapse;table-layout:fixed;margin:5px 0;font-size:${widthMm===58?'6.8':'8'}px}
th,td{border:1px solid #777;padding:${widthMm===58?'3px 1px':'3px 1.5px'};text-align:center;vertical-align:middle;overflow-wrap:anywhere;word-break:break-word}
th{background:#eee;font-weight:900}
.idx{width:7%}.desc{width:31%;text-align:right}.qty{width:12%}.qty small{display:block;font-size:.88em}.unit-price{width:21%}.amount-cell{width:29%}
.amount-cell b,.amount-cell small{display:block;line-height:1.35}.amount-cell small{font-size:.88em;color:#444;border-top:1px dotted #aaa;margin-top:2px;padding-top:2px}
.totals{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:5px}
.total-cell,.detail-cell{border:1px solid #aaa;border-radius:4px;padding:4px;display:flex;justify-content:space-between;align-items:center;gap:4px;min-width:0}
.total-cell span,.detail-cell span{color:#444;overflow-wrap:anywhere}
.total-cell b,.detail-cell b{font-weight:800;text-align:left;overflow-wrap:anywhere}
.total-cell.grand{grid-column:1/-1;border:1.5px solid #222;background:#f3f3f3;font-size:${widthMm===58?'9':'11'}px;padding:5px}
.more-info{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:5px}
.more-info .full{grid-column:1/-1}
.note{border:1px dashed #aaa;border-radius:4px;padding:4px;margin-top:4px;overflow-wrap:anywhere}
.foot{text-align:center;font-size:${widthMm===58?'7':'8'}px;margin-top:4px;color:#333}
@media print{html,body{width:${widthMm-3}mm!important;max-width:${widthMm-3}mm!important;margin:0!important}.party-card,table tr,.totals,.more-info{break-inside:avoid;page-break-inside:avoid}}
</style></head><body>
<header class="store-head">${logoHtml}<div><div class="store-name">${format.esc(biz.name)}</div><div class="store-meta">${biz.phone?`<span>تلفن: ${format.esc(biz.phone)}</span>`:''}${biz.address?`<span>${format.esc(biz.address)}</span>`:''}</div></div></header>
<div class="doc-head"><span>${format.esc(format.invoiceTypeTitle(invoice.type))} · ${format.esc(invoice.number)}</span><span>تاریخ: ${format.esc(invoice.date)}</span></div>
<section class="party-card">
  <div class="section-title">${buyerTitle}</div>
  <div class="party-grid">
    <div class="party-field full"><span class="label">نام:</span><b>${format.esc(party.name)}</b></div>
    ${party.phone?`<div class="party-field"><span class="label">تلفن:</span><b>${format.esc(party.phone)}</b></div>`:''}
    ${party.nationalId?`<div class="party-field"><span class="label">شناسه:</span><b>${format.esc(party.nationalId)}</b></div>`:''}
    ${party.economicCode?`<div class="party-field"><span class="label">اقتصادی:</span><b>${format.esc(party.economicCode)}</b></div>`:''}
    ${party.address?`<div class="party-field full"><span class="label">نشانی:</span><b>${format.esc(party.address)}</b></div>`:''}
  </div>
</section>
<table aria-label="اقلام فاکتور">
<thead><tr><th class="idx">ردیف</th><th class="desc">عنوان کالا</th><th class="qty">تعداد</th><th class="unit-price">قیمت واحد (مصرف‌کننده)</th><th class="amount-cell">مبلغ بعد از تخفیف</th></tr></thead>
<tbody>${lineRows||'<tr><td colspan="5">بدون قلم</td></tr>'}</tbody>
</table>
<section class="totals">
  <div class="total-cell"><span>جمع پس از تخفیف</span><b>${format.money(invoice.netRial)}</b></div>
  <div class="total-cell"><span>تخفیف اقلام</span><b>${format.money(discountTotal)}</b></div>
  <div class="total-cell"><span>مالیات (${format.fa((invoice.taxRateBps||0)/100)}٪)</span><b>${format.money(invoice.taxRial)}</b></div>
  <div class="total-cell"><span>وضعیت</span><b>${invoice.status==='posted'?'قطعی':'پیش‌نویس'}</b></div>
  <div class="total-cell grand"><span>مبلغ نهایی فاکتور</span><b>${format.money(invoice.grossRial)}</b></div>
</section>
${paymentLabels||invoice.dueDate||invoice.paymentTerms?`<section class="more-info">${paymentLabels}${invoice.dueDate?`<div class="detail-cell"><span>سررسید</span><b>${format.esc(invoice.dueDate)}</b></div>`:''}${invoice.paymentTerms?`<div class="detail-cell full"><span>شرایط پرداخت</span><b>${format.esc(invoice.paymentTerms)}</b></div>`:''}</section>`:''}
${invoice.notes?`<div class="note">توضیحات: ${format.esc(invoice.notes)}</div>`:''}
<div class="foot">با تشکر از خرید شما · ${format.esc(biz.name)}</div>
</body></html>`;
  const textLines=[
    title,
    `تاریخ: ${invoice.date}`,
    `${buyerTitle}: ${party.name}`,
    ...invoice.lines.map((line,index)=>`${index+1}) ${line.description} | تعداد ${format.fa(line.quantityMilli/1000)} | قیمت واحد ${format.money(line.unitPriceRial)} | مبلغ ${format.money(line.totalRial)} | تخفیف ${format.money(line.discountRial||0)}`),
    `جمع پس از تخفیف: ${format.money(invoice.netRial)}`,
    `مبلغ نهایی: ${format.money(invoice.grossRial)}`,
  ];
  return {title,html,text:textLines.join('\n')};
}



export interface InvoicePrintBusinessProfile extends ThermalBusinessProfile {
  slogan:string; nationalId:string; economicCode:string; postalCode:string;
}
export interface InvoicePrintLineProfit { cogsRial:number; known:boolean; }
export interface InvoicePrintFormat extends ThermalFormat {}

export function buildInvoiceDocumentHtml(
  invoice:CommercialInvoice,
  party:AccountingParty,
  biz:InvoicePrintBusinessProfile,
  internal:boolean,
  lineProfit:InvoicePrintLineProfit[],
  format:InvoicePrintFormat,
):{title:string;html:string;text:string}{
  const fa=format.fa, esc=format.esc, money=format.money;
  const invoiceTypeTitle=format.invoiceTypeTitle, isSaleInvoiceType=format.isSaleInvoiceType;
  let cogsSum=0, costedRev=0;
  const rows=invoice.lines.map((l,n)=>{
    const base=`<td>${n+1}</td><td>${esc(l.description)}</td><td>${fa(l.quantityMilli/1000)}</td><td>${esc(l.unit||'عدد')}</td><td>${money(l.unitPriceRial)}</td><td>${money(l.discountRial||0)}</td><td>${money(l.totalRial)}</td>`;
    if(!internal) return `<tr>${base}</tr>`;
    const p=lineProfit[n];
    if(p.known){ cogsSum+=p.cogsRial; costedRev+=l.totalRial; }
    const gp=p.known?l.totalRial-p.cogsRial:null;
    const margin=p.known&&l.totalRial>0?`${fa(Math.round((gp!/l.totalRial)*1000)/10)}٪`:'—';
    return `<tr>${base}<td>${p.known?money(p.cogsRial):'نامشخص'}</td><td>${gp!==null?money(gp):'—'}</td><td>${margin}</td></tr>`;
  }).join('');
  const paymentLines=(invoice.paymentParts||[]).map(x=>{
    const label=x.method==='cash'?'نقدی':x.method==='card'?'کارت':x.method==='cheque'?`چک ${x.chequeNumber||''} · ${x.chequeBank||''} · شناسه ${x.chequeAccount||'—'} · سررسید ${x.chequeDueDate||''}`:'اعتباری (مانده حساب)';
    return `${label}: ${money(x.amountRial)}`;
  });
  const title=`فاکتور ${invoiceTypeTitle(invoice.type)} ${invoice.number}${internal?' (داخلی)':''}`;
  const gpTotal=costedRev-cogsSum;
  const marginTotal=costedRev>0?Math.round((gpTotal/costedRev)*1000)/10:0;
  const textLines=[
    biz.name,
    biz.phone?`تلفن: ${biz.phone}`:'',
    biz.address?`آدرس: ${biz.address}`:'',
    title,
    internal?'*** نسخه داخلی / مدیریتی — محرمانه ***':'',
    `تاریخ: ${invoice.date}`,
    `وضعیت: ${invoice.status==='posted'?'قطعی':'پیش‌نویس'}`,
    `${isSaleInvoiceType(invoice.type)?'خریدار':'فروشنده'}: ${party.name}`,
    party.phone?`تلفن: ${party.phone}`:'',
    '',
    'اقلام:',
    ...invoice.lines.map((l,n)=>{
      const p=lineProfit[n];
      const extra=internal?(p.known?` | بهای ${money(p.cogsRial)} | سود ${money(l.totalRial-p.cogsRial)}`:' | بهای نامشخص'):'';
      return `${n+1}) ${l.description} | ${fa(l.quantityMilli/1000)} ${l.unit||'عدد'} | ${money(l.unitPriceRial)} | مبلغ ${money(l.totalRial)}${extra}`;
    }),
    '',
    `جمع: ${money(invoice.netRial)}`,
    `مالیات: ${money(invoice.taxRial)}`,
    `مبلغ نهایی: ${money(invoice.grossRial)}`,
    ...(internal?[
      `بهای تمام‌شده (داخلی): ${costedRev>0?money(cogsSum):'نامشخص'}`,
      `سود ناخالص (داخلی): ${costedRev>0?money(gpTotal):'—'}`,
      `حاشیه سود: ${costedRev>0?fa(marginTotal)+'٪':'—'}`,
    ]:[]),
    invoice.paymentTerms?`شرایط پرداخت: ${invoice.paymentTerms}`:'',
    invoice.dueDate?`سررسید: ${invoice.dueDate}`:'',
    ...paymentLines,
    invoice.notes?`توضیحات: ${invoice.notes}`:'',
    '',
    'ارسال‌شده از انبارین پرو',
  ].filter(x=>x!==undefined) as string[];
  const logoHtml=biz.logo?`<img class="logo" src="${biz.logo.replace(/"/g,'')}" alt="لوگو" />`:'';
  const bizIds=[
    biz.nationalId?`شناسه/ملی: ${esc(biz.nationalId)}`:'',
    biz.economicCode?`اقتصادی: ${esc(biz.economicCode)}`:'',
    biz.postalCode?`کدپستی: ${esc(biz.postalCode)}`:'',
  ].filter(Boolean).join(' · ');
  const html=`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>
*{box-sizing:border-box}
body{font-family:Tahoma,"Segoe UI",Arial,sans-serif;color:#0f172a;margin:16px;font-size:12.5px;line-height:1.55;background:#fff}
.sheet{max-width:900px;margin:0 auto;border:1px solid #dbe3ee;border-radius:12px;overflow:hidden}
.brand{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;background:linear-gradient(135deg,#0f766e 0%,#115e59 55%,#134e4a 100%);color:#fff}
.brand-main{display:flex;align-items:center;gap:12px;min-width:0}
.logo{max-height:52px;max-width:110px;object-fit:contain;background:#fff;border-radius:8px;padding:4px}
.brand h1{margin:0;font-size:18px;font-weight:800}
.brand .slogan{margin:2px 0 0;font-size:11px;opacity:.92}
.brand .doc-type{text-align:left;font-size:13px;font-weight:700;white-space:nowrap}
.brand-meta{padding:8px 16px;background:#f0fdfa;border-bottom:1px solid #cce7e2;color:#115e59;font-size:11px}
.brand-meta span{margin-left:12px}
.body{padding:14px 16px}
.head{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 0 12px}
.panel{border:1px solid #d5e7df;border-radius:10px;padding:10px 12px;background:linear-gradient(180deg,#f7fbf9 0%,#ffffff 100%);min-height:132px}
.panel b.panel-title{display:block;margin:0 0 8px;padding-bottom:6px;border-bottom:1px solid #dceee6;color:#0f766e;font-size:12px}
.panel .party-name{margin:0 0 6px;font-size:13px;font-weight:800;color:#0f172a}
.panel .row{display:flex;justify-content:space-between;gap:8px;margin:3px 0;font-size:11.5px}
.panel .row span{color:#64748b;flex:0 0 auto}
.panel .row strong{font-weight:600;text-align:left;word-break:break-word}
.panel .addr{margin-top:6px;font-size:11px;color:#334155;line-height:1.5}
.meta-bar{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:0 0 12px}
.meta-bar div{padding:8px 10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px}
.meta-bar span{display:block;font-size:10px;color:#64748b;margin-bottom:2px}
.meta-bar b{font-size:12.5px}
table{width:100%;border-collapse:collapse;margin:4px 0 12px}
th,td{border:1px solid #e2e8f0;padding:7px 8px;text-align:right}
th{background:#ecfdf5;color:#115e59;font-size:11px}
tbody tr:nth-child(even){background:#f8fafc}
.sum{max-width:360px;margin-right:auto;margin-top:4px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden}
.sum div{display:flex;justify-content:space-between;padding:8px 10px;border-bottom:1px solid #eef2f7}
.sum div:last-child{border-bottom:0;background:#ecfdf5;font-weight:800;color:#0f766e}
.note{white-space:pre-wrap;border:1px dashed #cbd5e1;padding:10px;margin-top:12px;border-radius:8px;background:#fcfcfd}
.sign{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:36px;text-align:center}
.sign div{border-top:1px solid #94a3b8;padding-top:8px;color:#475569}
.footer{margin-top:16px;text-align:center;color:#94a3b8;font-size:10px}
.actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin:18px 0}
.actions button{padding:10px 16px;border-radius:8px;border:1px solid #cbd5e1;background:#f8fafc;font:inherit;cursor:pointer}
.actions button.primary{background:#0f766e;color:#fff;border-color:#0f766e}
@media print{body{margin:8mm}.sheet{border:none;border-radius:0}.noprint{display:none!important}}
@media(max-width:640px){.head,.meta-bar,.sign{grid-template-columns:1fr}.brand{flex-direction:column;align-items:flex-start}}
</style></head><body class="invoice-print">
<div class="sheet">
  <div class="brand">
    <div class="brand-main">${logoHtml}<div><h1>${esc(biz.name)}</h1>${biz.slogan?`<div class="slogan">${esc(biz.slogan)}</div>`:''}</div></div>
    <div class="doc-type">فاکتور ${esc(invoiceTypeTitle(invoice.type))}</div>
  </div>
  <div class="brand-meta">
    ${biz.phone?`<span>☎ ${esc(biz.phone)}</span>`:''}
    ${biz.address?`<span>📍 ${esc(biz.address)}</span>`:''}
    ${bizIds?`<span>${bizIds}</span>`:''}
  </div>
  <div class="body">
<div class="head">
  <div class="panel">
    <b class="panel-title">مشخصات ${isSaleInvoiceType(invoice.type)?'فروشنده':'خریدار'}</b>
    <div class="party-name">${esc(isSaleInvoiceType(invoice.type)?biz.name:party.name)}</div>
    <div class="row"><span>شناسه/ملی</span><strong>${esc((isSaleInvoiceType(invoice.type)?biz.nationalId:party.nationalId)||'—')}</strong></div>
    <div class="row"><span>کد اقتصادی</span><strong>${esc((isSaleInvoiceType(invoice.type)?biz.economicCode:party.economicCode)||'—')}</strong></div>
    ${!isSaleInvoiceType(invoice.type)&&party.registrationNumber?`<div class="row"><span>شماره ثبت</span><strong>${esc(party.registrationNumber)}</strong></div>`:''}
    <div class="row"><span>تلفن</span><strong>${esc((isSaleInvoiceType(invoice.type)?biz.phone:party.phone)||'—')}</strong></div>
    <div class="row"><span>کد پستی</span><strong>${esc((isSaleInvoiceType(invoice.type)?biz.postalCode:party.postalCode)||'—')}</strong></div>
    <div class="addr">نشانی: ${esc((isSaleInvoiceType(invoice.type)?biz.address:party.address)||'—')}</div>
  </div>
  <div class="panel">
    <b class="panel-title">مشخصات ${isSaleInvoiceType(invoice.type)?'خریدار':'فروشنده'}</b>
    <div class="party-name">${esc(isSaleInvoiceType(invoice.type)?party.name:biz.name)}</div>
    <div class="row"><span>شناسه/ملی</span><strong>${esc((isSaleInvoiceType(invoice.type)?party.nationalId:biz.nationalId)||'—')}</strong></div>
    <div class="row"><span>کد اقتصادی</span><strong>${esc((isSaleInvoiceType(invoice.type)?party.economicCode:biz.economicCode)||'—')}</strong></div>
    ${isSaleInvoiceType(invoice.type)&&party.registrationNumber?`<div class="row"><span>شماره ثبت</span><strong>${esc(party.registrationNumber)}</strong></div>`:''}
    <div class="row"><span>تلفن</span><strong>${esc((isSaleInvoiceType(invoice.type)?party.phone:biz.phone)||'—')}</strong></div>
    <div class="row"><span>کد پستی</span><strong>${esc((isSaleInvoiceType(invoice.type)?party.postalCode:biz.postalCode)||'—')}</strong></div>
    <div class="addr">نشانی: ${esc((isSaleInvoiceType(invoice.type)?party.address:biz.address)||'—')}</div>
  </div>
</div>
<div class="meta-bar">
  <div><span>شماره فاکتور</span><b>${esc(invoice.number)}</b></div>
  <div><span>تاریخ</span><b>${esc(invoice.date)}</b></div>
  <div><span>نوع</span><b>${esc(invoiceTypeTitle(invoice.type))}</b></div>
  <div><span>وضعیت</span><b>${invoice.status==='posted'?'قطعی':'پیش‌نویس'}</b></div>
</div>
${internal?`<div style="background:#fff3cd;border:1px solid #f0c36d;padding:8px 12px;margin:0 0 12px;border-radius:8px;font-weight:700">نسخه داخلی / مدیریتی — شامل سود ناخالص — برای مشتری چاپ نشود</div>`:''}
<table><thead><tr><th>ردیف</th><th>شرح کالا / خدمت</th><th>تعداد</th><th>واحد</th><th>قیمت واحد</th><th>تخفیف</th><th>مبلغ</th>${internal?'<th>بهای</th><th>سود ناخالص</th><th>حاشیه</th>':''}</tr></thead><tbody>${rows}</tbody></table>
<div class="sum">
  <div><span>جمع پس از تخفیف</span><b>${money(invoice.netRial)}</b></div>
  <div><span>مالیات (${fa((invoice.taxRateBps||0)/100)}٪)</span><b>${money(invoice.taxRial)}</b></div>
  <div><span>مبلغ نهایی</span><b>${money(invoice.grossRial)}</b></div>
  ${internal?`<div><span>بهای تمام‌شده (داخلی)</span><b>${costedRev>0?money(cogsSum):'نامشخص'}</b></div>
  <div><span>سود ناخالص (داخلی)</span><b>${costedRev>0?money(gpTotal):'—'}</b></div>
  <div><span>حاشیه سود</span><b>${costedRev>0?fa(marginTotal)+'٪':'—'}</b></div>`:''}
</div>
<p>شرح: ${esc(invoice.description||'—')}</p>
<div class="panel" style="margin-top:12px"><b>شرایط پرداخت</b>
  <p>${esc(invoice.paymentTerms||'—')}</p>
  ${invoice.dueDate?`<p>سررسید: ${esc(invoice.dueDate)}</p>`:''}
  ${(invoice.paymentParts||[]).length?`<ul>${invoice.paymentParts!.map(x=>`<li>${x.method==='cash'?'نقدی':x.method==='card'?'کارت':x.method==='cheque'?`چک ${esc(x.chequeNumber||'')} · ${esc(x.chequeBank||'')} · شناسه ${esc(x.chequeAccount||'—')} · سررسید ${esc(x.chequeDueDate||'')}`:'اعتباری'}: ${money(x.amountRial)}</li>`).join('')}</ul>`:''}
</div>
<div class="note">توضیحات: ${esc(invoice.notes||'—')}</div>
<div class="sign"><div>امضا و مهر ${isSaleInvoiceType(invoice.type)?'فروشنده':'خریدار'}</div><div>امضا و مهر ${isSaleInvoiceType(invoice.type)?'خریدار':'فروشنده'}</div></div>
<div class="footer">صادر شده توسط ${esc(biz.name)} · انبارین پرو</div>
</div></div>
<div class="actions noprint">
  <button class="primary" type="button" onclick="window.print()">چاپ</button>
  <button type="button" onclick="window.close()">بستن</button>
</div>
</body></html>`;
  return {title,html,text:textLines.filter(Boolean).join('\n')};
}

export function applyInvoicePaperLayout(html:string,size:'a4'|'a5'):string {
  const a5=size==='a5';
  const css=`
@media print {
  @page { size:${a5?'A5':'A4'} portrait; margin:${a5?'5mm':'9mm'}; }
  html,body { margin:0!important; padding:0!important; width:auto!important; background:#fff!important; }
  body.invoice-print { font-size:${a5?'8':'10'}pt!important; line-height:${a5?'1.22':'1.42'}!important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  ${a5 ? 'body.invoice-print { zoom:.82!important; }' : ''}
  body.invoice-print .sheet { width:100%!important; max-width:none!important; margin:0!important; border:0!important; border-radius:0!important; overflow:visible!important; }
  body.invoice-print .brand { padding:${a5?'2mm 3mm':'6mm 7mm'}!important; break-inside:avoid; }
  body.invoice-print .brand h1 { font-size:${a5?'14':'17'}pt!important; }
  body.invoice-print .brand-meta { padding:${a5?'2mm 5mm':'3mm 7mm'}!important; font-size:${a5?'7.5':'8.5'}pt!important; }
  body.invoice-print .body { padding:${a5?'2mm 3mm':'6mm 7mm'}!important; }
  body.invoice-print .head { grid-template-columns:repeat(2,minmax(0,1fr))!important; gap:${a5?'2mm':'3mm'}!important; }
  body.invoice-print .panel { min-width:0; min-height:0!important; padding:${a5?'2mm':'3mm'}!important; break-inside:avoid; }
  body.invoice-print .panel .row { font-size:${a5?'7.2':'8.5'}pt!important; gap:3px!important; }
  body.invoice-print .panel .party-name { font-size:${a5?'8.5':'10'}pt!important; }
  body.invoice-print .panel .addr { font-size:${a5?'7':'8'}pt!important; }
  body.invoice-print .meta-bar { grid-template-columns:${a5?'repeat(2,minmax(0,1fr))':'repeat(4,minmax(0,1fr))'}!important; gap:2mm!important; }
  body.invoice-print .meta-bar div { min-width:0; padding:${a5?'1.5mm 2mm':'2mm 2.5mm'}!important; }
  body.invoice-print .meta-bar b { font-size:${a5?'8':'9'}pt!important; overflow-wrap:anywhere; }
  body.invoice-print table { width:100%!important; table-layout:fixed!important; border-collapse:collapse!important; font-size:${a5?'6.8':'8'}pt!important; }
  body.invoice-print th,body.invoice-print td { padding:${a5?'1mm .8mm':'1.5mm 1.2mm'}!important; overflow-wrap:anywhere!important; word-break:break-word!important; }
  body.invoice-print th { font-size:${a5?'6.5':'7.5'}pt!important; }
  body.invoice-print tbody tr { break-inside:avoid; page-break-inside:avoid; }
  body.invoice-print .sum { max-width:${a5?'78mm':'95mm'}!important; font-size:${a5?'8':'9'}pt!important; break-inside:avoid; }
  body.invoice-print .sum div { padding:${a5?'1.5mm 2mm':'2mm 2.5mm'}!important; }
  body.invoice-print .note { font-size:${a5?'7.5':'8.5'}pt!important; }
  body.invoice-print .sign { grid-template-columns:1fr 1fr!important; gap:${a5?'4mm':'18mm'}!important; margin-top:${a5?'4mm':'18mm'}!important; }
  body.invoice-print .footer { margin-top:5mm!important; }
  body.invoice-print .noprint { display:none!important; }
}
`;
  return html.replace(/<\/head>/i,`<style id="anbarin-invoice-paper-layout">${css}</style></head>`);
}

