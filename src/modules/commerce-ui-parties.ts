/** رندر مستقل فهرست و فرم طرف‌حساب؛ بدون دسترسی مستقیم به state یا ذخیره‌سازی. */
export interface CommercePartyView {
  id: string;
  name: string;
  type: 'customer' | 'supplier' | 'both';
  phone?: string;
  nationalId?: string;
  economicCode?: string;
  registrationNumber?: string;
  postalCode?: string;
  address?: string;
  isActive: boolean;
}

export function partyTypeLabel(type: CommercePartyView['type']): string {
  return type === 'customer' ? 'مشتری' : type === 'supplier' ? 'تأمین‌کننده' : 'مشتری و تأمین‌کننده';
}

export function buildPartyOptions(
  parties: CommercePartyView[],
  type: 'customer' | 'supplier' | undefined,
  escapeHtml: (value: string) => string,
): string {
  return parties.filter(p => p.isActive && (!type || p.type === 'both' || p.type === type))
    .map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('');
}

export function bindPartySmsButtons(
  root: ParentNode,
  parties: CommercePartyView[],
  openSmsDialog: (args: { phone: string; name: string; title: string }) => void,
): void {
  type SmsButtonState = HTMLButtonElement & {
    _smsBound?: boolean;
    _smsParties?: CommercePartyView[];
    _smsOpenDialog?: typeof openSmsDialog;
  };
  root.querySelectorAll<HTMLButtonElement>('[data-sms-party]').forEach(rawButton => {
    const btn = rawButton as SmsButtonState;
    // به‌روزرسانی داده‌ها حتی اگر listener قبلاً نصب شده باشد.
    btn._smsParties = parties;
    btn._smsOpenDialog = openSmsDialog;
    if (btn._smsBound) return;
    btn._smsBound = true;
    btn.addEventListener('click', () => {
      const current = btn._smsParties || [];
      const party = current.find(item => item.id === (btn.dataset.smsParty || ''));
      if (!party) return;
      btn._smsOpenDialog?.({
        phone: party.phone || '',
        name: party.name,
        title: `پیامک به ${party.name}`,
      });
    });
  });
}

export function buildPartiesPanelHtml(
  parties: CommercePartyView[],
  editingPartyId: string | null,
  escapeHtml: (value: string) => string,
): string {
  const rows = parties.slice().sort((a, b) => a.name.localeCompare(b.name, 'fa')).map(p =>
    `<tr class="${p.isActive ? '' : 'party-inactive'}"><td>${escapeHtml(p.name)}</td><td>${partyTypeLabel(p.type)}</td><td>${escapeHtml(p.phone || '—')}</td><td>${escapeHtml(p.nationalId || '—')}</td><td>${escapeHtml(p.address || '—')}</td><td>${p.isActive ? 'فعال' : 'غیرفعال'}</td><td style="white-space:nowrap"><button type="button" class="btn btn-sm btn-secondary" data-edit-party="${escapeHtml(p.id)}">ویرایش</button>${p.phone ? ` <button type="button" class="btn btn-sm btn-secondary" data-sms-party="${escapeHtml(p.id)}">پیامک</button>` : ''}</td></tr>`
  ).join('') || '<tr><td colspan="7">هنوز طرف حسابی ثبت نشده است.</td></tr>';
  const editing = editingPartyId ? parties.find(p => p.id === editingPartyId) : undefined;
  return `<div class="card" style="margin-top:12px" dir="rtl">
<h3>تعریف شخص / طرف حساب</h3>
<p class="hint">فیلدهای استاندارد: نام، موبایل، آدرس، شناسه ملی، کد اقتصادی، شماره ثبت، کد پستی و نوع طرف حساب. از همین فرم می‌توانید مشتری یا تأمین‌کننده جدید بسازید یا ویرایش کنید.</p>
<div class="form-grid" id="partyFormGrid">
<input type="hidden" id="partyEditId" value="${escapeHtml(editing?.id || '')}">
<label class="field">نام <span class="required">*</span><input id="partyName" value="${escapeHtml(editing?.name || '')}" placeholder="نام شخص یا شرکت" autocomplete="name"></label>
<label class="field">نوع طرف حساب
<select id="partyType">
<option value="customer"${!editing || editing.type === 'customer' ? ' selected' : ''}>مشتری</option>
<option value="supplier"${editing?.type === 'supplier' ? ' selected' : ''}>تأمین‌کننده</option>
<option value="both"${editing?.type === 'both' ? ' selected' : ''}>مشتری و تأمین‌کننده</option>
</select></label>
<label class="field">موبایل / تلفن<input id="partyPhone" value="${escapeHtml(editing?.phone || '')}" placeholder="۰۹۱۲..." inputmode="tel" autocomplete="tel"></label>
<label class="field">شناسه ملی / کد ملی<input id="partyNationalId" value="${escapeHtml(editing?.nationalId || '')}" placeholder="۱۰ تا ۱۴ رقم" inputmode="numeric"></label>
<label class="field">کد اقتصادی<input id="partyEconomicCode" value="${escapeHtml(editing?.economicCode || '')}" placeholder="اختیاری"></label>
<label class="field">شماره ثبت<input id="partyRegistrationNumber" value="${escapeHtml(editing?.registrationNumber || '')}" placeholder="اختیاری"></label>
<label class="field">کد پستی<input id="partyPostalCode" value="${escapeHtml(editing?.postalCode || '')}" placeholder="۱۰ رقم" inputmode="numeric"></label>
<label class="field" style="grid-column:1/-1">آدرس<textarea id="partyAddress" rows="2" placeholder="نشانی کامل">${escapeHtml(editing?.address || '')}</textarea></label>
<label class="field"><span>وضعیت</span><select id="partyIsActive"><option value="1"${!editing || editing.isActive ? ' selected' : ''}>فعال</option><option value="0"${editing && !editing.isActive ? ' selected' : ''}>غیرفعال</option></select></label>
</div>
<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
<button type="button" class="btn btn-primary" id="partySaveBtn">${editing ? 'ذخیره تغییرات' : 'ثبت شخص جدید'}</button>
<button type="button" class="btn btn-secondary" id="partyResetBtn" ${editing ? '' : 'hidden'}>انصراف از ویرایش</button>
</div>
<h4 style="margin-top:22px">فهرست طرف حساب‌ها</h4>
<div class="table-wrap"><table class="data-table"><thead><tr><th>نام</th><th>نوع</th><th>موبایل</th><th>شناسه ملی</th><th>آدرس</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>${rows}</tbody></table></div>
</div>`;
}
