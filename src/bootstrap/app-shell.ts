/** پوستهٔ اصلی رابط کاربری انبارین؛ منطق رویدادها از بیرون تزریق می‌شود. */
export function renderShell(bindEvents: () => void, setupVirtualLists: () => void): void {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `
    <header>
      <div class="header-top">
        <div class="logo-area">
          <img class="brand-logo" src="./logo.png" alt="لوگوی انبارین" />
          <div class="brand-title"><strong>انبارین</strong>
          <span class="version">v2.1.10</span>
          <span class="role-badge" id="roleBadge">—</span></div>
        </div>
        <div class="header-stats" id="headerStats"></div>
      </div>
    </header>

    <main>
      <section class="page active" id="page-count">
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px">
            <h2 style="margin:0">شمارش انبار</h2>
            <button class="btn btn-sm btn-secondary" id="undoBtn" disabled title="برگشت آخرین عمل">↩ Undo</button>
          </div>
          <p class="hint" id="sessionHint">—</p>
          <div id="statsBox" class="stats-grid"></div>

          <div id="phaseBar" class="phase-bar" style="display:none;margin-top:10px">
            <button type="button" class="filter-chip" data-phase="1">شمارش اول</button>
            <button type="button" class="filter-chip" data-phase="2">شمارش دوم</button>
          </div>

          <div class="session-bar" id="sessionBar">
            <span id="sessionLabel" class="hint">—</span>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button class="btn btn-sm btn-primary" id="btnStartSession">جلسه جدید</button>
              <button class="btn btn-sm btn-secondary" id="btnCloseSession">بستن جلسه</button>
            </div>
          </div>

          <div class="actions" style="margin-top:16px">
            <button class="btn btn-primary" id="btnOpenScanner">📷 باز کردن اسکنر</button>
            <button class="btn btn-secondary" id="btnQuickCount">⚡ شمارش سریع (+۱)</button>
            <button class="btn btn-secondary" id="btnTakePhoto">🖼 عکس کالای آخر</button>
          </div>
          <p class="hint" id="lastScanInfo" style="margin-top:8px"></p>
          <p class="hint" id="btStatus" style="margin-top:4px;direction:ltr;text-align:left"></p>

          <div style="margin-top:16px">
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
              <button type="button" class="filter-chip active" data-cf="all">همه</button>
              <button type="button" class="filter-chip" data-cf="counted">شمارش‌شده</button>
              <button type="button" class="filter-chip" data-cf="uncounted">مانده</button>
              <button type="button" class="filter-chip" data-cf="diff">مغایرت</button>
            </div>
            <input type="search" id="searchCount" placeholder="جستجو در شمارش..." class="search-input" />
            <select id="locationFilterSelect" class="search-input" style="margin-top:8px">
              <option value="">همه محل‌ها</option>
            </select>
            <p class="hint" style="margin-top:6px">نمایش: <strong id="countListCount">0</strong></p>
            <div id="countVList" class="vlist"></div>
          </div>
        </div>
      </section>

      <section class="page" id="page-products">
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
            <h2 style="margin:0">لیست کالاها</h2>
            <button class="btn btn-sm btn-primary" id="btnAddProduct">＋ کالا</button>
          </div>
          <p class="hint" style="margin-top:8px">نمایش: <strong id="productCount">0</strong></p>
          <input type="search" id="searchProducts" placeholder="جستجو نام / بارکد / محل..." class="search-input" style="margin-top:10px" />
          <select id="locationFilterSelectProducts" class="search-input" style="margin-top:8px">
            <option value="">همه محل‌ها</option>
          </select>
          <div id="productsVList" class="vlist vlist-tall" style="margin-top:12px"></div>
        </div>
      </section>

      <section class="page page-reports-compact" id="page-reports">
        <div class="card report-page-card">
          <h2 style="margin:0 0 8px">گزارش انبارگردانی</h2>
          <div id="managementDashboard"></div>
          <div id="reportSummary"></div>
          <div class="actions report-actions-grid" style="margin-top:10px">
            <button class="btn btn-primary btn-sm" id="btnCopyReport">کپی خلاصه</button>
            <button class="btn btn-success btn-sm" id="btnExportDiffs">اکسل مغایرت</button>
            <button class="btn btn-success btn-sm" id="btnExportCountedProducts">اکسل شمارش</button>
            <button class="btn btn-secondary btn-sm" id="btnDoubleDiff">اختلاف ۱و۲</button>
            <button class="btn btn-secondary btn-sm" id="btnStockAlerts">CSV هشدار موجودی</button>
            <button class="btn btn-secondary btn-sm" id="btnPrintLabels">چاپ لیبل</button>
            <button class="btn btn-secondary btn-sm" id="btnAccGeneric">سند اصلاح</button>
            <button class="btn btn-secondary btn-sm" id="btnAccHeloo">قالب هلو</button>
            <button class="btn btn-secondary btn-sm" id="btnAccSepidar">قالب سپیدار</button>
          </div>
          <details class="report-fold">
            <summary>اسناد انبار</summary>
            <p class="hint">پیش‌نویس → بعد از تأیید روی موجودی اثر می‌گذارد.</p>
            <div class="form-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:6px;margin-top:6px">
              <label>نوع سند<select id="invDocKind" class="search-input"><option value="receipt">رسید</option><option value="issue">حواله</option><option value="adjustment">اصلاح</option><option value="transfer">انتقال</option></select></label>
              <label>کالا<select id="invDocProduct" class="search-input"><option value="">انتخاب...</option></select></label>
              <label>مقدار<input id="invDocQty" class="search-input" type="number" min="0.0001" step="any" placeholder="مقدار" /></label>
              <label id="invDocDestinationWrap" hidden>مقصد<select id="invDocDestination" class="search-input"><option value="">انبار مقصد</option></select></label>
            </div>
            <label style="display:block;margin-top:6px">علت<input id="invDocReason" class="search-input" placeholder="علت ثبت سند" /></label>
            <div class="actions report-actions-grid" style="margin-top:8px">
              <button class="btn btn-primary btn-sm" id="btnCreateInvDoc">پیش‌نویس</button>
              <button class="btn btn-secondary btn-sm" id="btnExportInventoryDocs">CSV اسناد</button>
            </div>
            <div id="inventoryDocumentsList" style="margin-top:8px"></div>
          </details>
          <details class="report-fold">
            <summary>کاردکس کالا</summary>
            <select id="cardexProductSelect" class="search-input" style="width:100%;margin:6px 0"><option value="">انتخاب کالا...</option></select>
            <div class="actions report-actions-grid">
              <button class="btn btn-success btn-sm" id="btnCardexExcel">Excel</button>
              <button class="btn btn-secondary btn-sm" id="btnCardexPdf">چاپ</button>
            </div>
            <div id="cardexResult" style="margin-top:8px" class="hint">کالا را انتخاب کنید.</div>
          </details>
          <details class="report-fold">
            <summary>هشدار · گردش · تاریخچه</summary>
            <div id="stockAlertsPanel"></div>
            <div id="inventoryMovementPanel"></div>
            <div id="activityHistoryPanel"></div>
          </details>
          <details class="report-fold">
            <summary>تنظیم ستون اکسل هلو / سپیدار</summary>
            <p class="hint" style="margin:6px 0">خروجی فقط کالاهای شمارش‌شده.</p>
            <select id="accountingTemplateTarget" class="search-input" style="margin:4px 0 8px;width:100%">
              <option value="heloo">هلو</option><option value="sepidar">سپیدار</option>
            </select>
            <div id="accountingTemplateFields" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:2px"></div>
            <div class="actions report-actions-grid" style="margin-top:8px">
              <button class="btn btn-secondary btn-sm" id="btnSaveAccountingTemplate" type="button">ذخیره قالب</button>
              <button class="btn btn-primary btn-sm" id="btnExportAccountingTemplate" type="button">خروجی اکسل</button>
            </div>
          </details>
          <div class="actions report-actions-grid" style="margin-top:10px">
            <button class="btn btn-primary btn-sm" id="btnApplySystem">اعمال شمارش → سیستم</button>
            <button class="btn btn-secondary btn-sm" id="btnResetToSystem">شمارش = سیستم</button>
          </div>
        </div>
      </section>

      <section class="page" id="page-accounting">
        <div class="card">
          <h2>حسابداری حرفه‌ای</h2>
          <p class="hint">بازرگانی، اسناد، کدینگ و گزارش‌ها هر کدام در برگه تمام‌صفحه جدا باز می‌شوند. مبالغ در پایگاه داده به ریال ذخیره می‌شوند.</p>
          <div id="accountingWorkspace"><p class="hint">در حال بارگذاری حسابداری...</p></div>
          <div id="accountingCommerceWorkspace" hidden><p class="hint">در حال بارگذاری فاکتورها و دریافت‌وپرداخت...</p></div>
          <div id="accountingReportsWorkspace" hidden><p class="hint">در حال بارگذاری گزارش‌های مالی...</p></div>
        </div>
      </section>

      <section class="page" id="page-health">
        <div class="card">
          <h2>مرکز سلامت داده‌ها</h2>
          <p class="hint">بررسی ساختار کالاها، بارکدها، اسناد حسابداری، بهای تمام‌شده، پشتیبان و زنجیره لاگ. این بخش فقط گزارش می‌دهد و اطلاعات را تغییر نمی‌دهد.</p>
          <button class="btn btn-primary" id="btnRunDataHealth" type="button">اجرای دوباره بررسی</button>
          <div id="dataHealthWorkspace" style="margin-top:12px"><p class="hint">برای شروع بررسی وارد این بخش شوید.</p></div>
        </div>
      </section>

      <section class="page" id="page-audit">
        <div class="card">
          <h2>لاگ عملیات</h2>
          <p class="hint">تاریخچه شمارش، ورود، ادغام، ویرایش کالا و …</p>
          <input type="search" id="auditSearch" placeholder="جستجو در لاگ..." class="search-input" style="margin-top:10px" />
          <div id="auditList" style="margin-top:10px"></div>
          <div class="actions" style="margin-top:12px">
            <button class="btn btn-audit-export btn-block" id="btnExportAudit" type="button">📄 دانلود CSV لاگ</button>
            <button class="btn btn-audit-clear btn-block" id="btnClearAudit" type="button">🗑 پاک کردن لاگ</button>
          </div>
        </div>
      </section>

      <section class="page" id="page-admin">
        <div class="card">
          <h2>وضعیت سیستم</h2>
          <ul class="info-list">
            <li>منبع داده: <code id="storageInfo">—</code></li>
            <li>انبار فعال: <code id="warehouseInfo">—</code></li>
            <li>نقش: <code id="roleInfo">—</code></li>
            <li>قابلیت اسکنر: <code id="capsInfo">—</code></li>
            <li>شمارش دومرحله‌ای: <code id="doubleInfo">—</code></li>
          </ul>
        </div>
        <div class="card settings-main-card" style="margin-top:12px">
          <h2>تنظیمات</h2>
          <details class="settings-subfold" open>
            <summary class="settings-subfold-summary">ظاهر، اسکن و نقش</summary>
            <div class="settings-subfold-body">
          <div class="theme-pref-card" style="margin:10px 0 12px;padding:12px;border:1px solid var(--border);background:var(--primary-soft);border-radius:var(--radius-sm)">
            <h3 style="margin:0 0 6px;font-size:1rem">ظاهر برنامه</h3>
            <p class="hint" style="margin:0 0 8px">روشن، تاریک، یا خودکار مطابق تنظیمات گوشی</p>
            <div class="auto-backup-actions" role="radiogroup" aria-label="تم ظاهر">
              <button type="button" class="btn btn-sm auto-backup-btn" data-theme-pref="light" aria-pressed="false">روشن</button>
              <button type="button" class="btn btn-sm auto-backup-btn" data-theme-pref="dark" aria-pressed="false">تاریک</button>
              <button type="button" class="btn btn-sm auto-backup-btn" data-theme-pref="auto" aria-pressed="false">خودکار</button>
            </div>
          </div>
          <div class="settings-grid">
            <label class="set-row"><span>اسکن پیوسته</span><input type="checkbox" id="setContinuous" /></label>
            <label class="set-row"><span>پرش خودکار بعد از اسکن</span><input type="checkbox" id="setAutoNext" /></label>
            <label class="set-row"><span>صدای اسکن</span><input type="checkbox" id="setSound" /></label>
            <label class="set-row"><span>ویبره</span><input type="checkbox" id="setVibrate" /></label>
            <label class="set-row"><span>افزایش خودکار (+۱)</span><input type="checkbox" id="setAutoInc" /></label>
            <label class="set-row"><span>شمارش کور (بدون نمایش مغایرت)</span><input type="checkbox" id="setBlind" /></label>
            <label class="set-row"><span>اسکنر USB/Bluetooth</span><input type="checkbox" id="setBt" /></label>
            <label class="set-row"><span>شمارش دومرحله‌ای</span><input type="checkbox" id="setDouble" /></label>
            <div class="role-settings-panel" id="roleSettingsPanel">
              <div class="role-settings-heading">
                <div>
                  <strong>نقش و سطح دسترسی</strong>
                  <p>نقش را انتخاب کنید؛ دسترسی‌ها پس از ذخیره دوباره اعمال و بررسی می‌شوند.</p>
                </div>
                <span class="role-current-pill" id="rolePreviewPill">مدیر</span>
              </div>
              <label class="set-row" for="setRole"><span>نقش کاربر</span>
                <select id="setRole" aria-describedby="rolePreviewDescription">
                  <option value="admin">مدیر</option>
                  <option value="counter">شمارنده</option>
                  <option value="viewer">مشاهده‌گر</option>
                </select>
              </label>
              <p class="role-preview-description" id="rolePreviewDescription" aria-live="polite">دسترسی کامل به تنظیمات و عملیات مدیریتی.</p>
              <div class="role-permission-list" id="rolePermissionList" aria-live="polite">
                <span>✓ مدیریت تنظیمات و مجوزها</span><span>✓ شمارش و ویرایش کالا</span><span>✓ ورود و خروج اطلاعات</span>
              </div>
            </div>
            <label class="set-row"><span>انبار فعال</span><input type="text" id="setWarehouse" /></label>
            <label class="set-row"><span>نام اپراتور</span><input type="text" id="setOperator" placeholder="نام شما" /></label>
          </div>

            </div>
          </details>
          <details class="settings-subfold">
            <summary class="settings-subfold-summary">فروشگاه / شرکت (فاکتور)</summary>
            <div class="settings-subfold-body">
          <div class="card settings-inner-card" style="margin-top:8px;padding:12px;border:1px solid var(--border);background:var(--primary-soft);border-radius:var(--radius-sm)">
            <h3 style="margin:0 0 6px;font-size:1rem">فروشگاه / شرکت (فاکتور)</h3>
            <p class="hint" style="margin:0 0 10px">این اطلاعات روی فاکتور چاپ و اشتراک نمایش داده می‌شود.</p>
            <div class="form-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px">
              <label class="field">نام فروشگاه / شرکت<input id="setBusinessName" class="search-input" placeholder="مثلاً فروشگاه انبارین" /></label>
              <label class="field">شعار / عنوان فرعی<input id="setBusinessSlogan" class="search-input" placeholder="اختیاری" /></label>
              <label class="field">تلفن<input id="setBusinessPhone" class="search-input" placeholder="021-..." /></label>
              <label class="field">شناسه ملی / کد ملی<input id="setBusinessNationalId" class="search-input" /></label>
              <label class="field">کد اقتصادی<input id="setBusinessEconomicCode" class="search-input" /></label>
              <label class="field">کد پستی<input id="setBusinessPostalCode" class="search-input" /></label>
            </div>
            <label class="field" style="display:block;margin-top:8px">نشانی
              <input id="setBusinessAddress" class="search-input" placeholder="آدرس کامل فروشگاه" />
            </label>
            <div class="logo-picker-card" style="margin-top:10px">
              <div class="logo-picker-head">
                <strong>لوگوی فروشگاه</strong>
                <span class="hint">PNG / JPG / WebP — ترجیحاً زیر ۲۰۰KB</span>
              </div>
              <div class="logo-picker-body">
                <div class="logo-picker-preview-wrap">
                  <img id="setBusinessLogoPreview" class="logo-picker-preview" alt="پیش‌نمایش لوگو" style="display:none" />
                  <span class="logo-picker-placeholder" id="setBusinessLogoPlaceholder">بدون لوگو</span>
                </div>
                <div class="logo-picker-actions">
                  <label class="btn btn-primary btn-sm logo-picker-file-btn" for="setBusinessLogo">انتخاب لوگو</label>
                  <input id="setBusinessLogo" type="file" accept="image/png,image/jpeg,image/webp,image/*" hidden />
                  <button type="button" class="btn btn-secondary btn-sm" id="btnClearBusinessLogo">حذف لوگو</button>
                </div>
              </div>
            </div>
          </div>


            </div>
          </details>
          <details class="settings-subfold">
            <summary class="settings-subfold-summary">پشتیبان خودکار و آنلاین</summary>
            <div class="settings-subfold-body">
          <div class="card auto-backup-card settings-inner-card" style="margin-top:8px;padding:12px;border:1px solid var(--border);background:var(--primary-soft);border-radius:var(--radius-sm)">
            <h3 style="margin:0 0 6px;font-size:1rem">پشتیبان خودکار و آنلاین</h3>
            <p class="hint" style="margin:0 0 8px"><b>Google Drive:</b> روی «ورود Google Drive» بزنید. اگر ورود مستقیم حساب ممکن باشد بدون انتخاب پوشه وصل می‌شود؛ در غیر این صورت یک‌بار پوشه Drive را انتخاب می‌کنید و بعدش خودکار ادامه می‌یابد. بدون اتصال، پشتیبان محلی فعال است.</p>
            <p class="hint auto-backup-status" id="autoBackupLocationLabel" style="margin:0 0 10px">وضعیت: —</p>
            <p class="hint" style="margin:0 0 8px">پشتیبان واحد و رمزنگاری‌شده برنامه؛ شامل ماژول‌های دارای لایسنس فعال. برای ساخت فایل، رمز بازیابی و کلید عمومی سازمان باید در همین بخش تنظیم شده باشد. در بازیابی، فقط ماژول‌های مجاز فعلی جایگزین می‌شوند.</p>
            <div class="auto-backup-actions" role="group" aria-label="پشتیبان‌گیری و بازیابی دستی">
              <button type="button" class="btn btn-sm btn-primary" id="btnExportUnifiedBackup">ذخیره فایل پشتیبان</button>
              <button type="button" class="btn btn-sm btn-secondary" id="btnImportUnifiedBackup">بازیابی از فایل</button>
              <input type="file" id="unifiedBackupFile" accept="application/json,.json" hidden />
            </div>
            <p class="hint" id="unifiedBackupStatus" role="status" style="margin:6px 0 10px"></p>
            <div class="auto-backup-actions" role="group" aria-label="گزینه‌های پشتیبان">
              <button type="button" class="btn btn-sm auto-backup-btn" id="btnConnectGoogleDriveAccount" data-backup-role="drive-connect">ورود Google Drive</button>
              <button type="button" class="btn btn-sm auto-backup-btn" id="btnDisconnectGoogleDriveAccount" data-backup-role="drive-disconnect">قطع Drive</button>
              <button type="button" class="btn btn-sm auto-backup-btn" id="btnPickAutoBackupFolder" data-backup-role="local-pick">پوشه محلی</button>
              <button type="button" class="btn btn-sm auto-backup-btn" id="btnResetAutoBackupFolder" data-backup-role="local-default">پیش‌فرض محلی</button>
              <button type="button" class="btn btn-sm auto-backup-btn auto-backup-btn-run" id="btnRunAutoBackupNow" data-backup-role="run-now">پشتیبان همین حالا</button>
            </div>
            <div class="backup-encryption-setup" style="margin-top:12px;padding:10px;border:1px solid var(--border);border-radius:10px;background:var(--bg)">
              <strong>امنیت رمزنگاری بکاپ (AES-256-GCM + Hybrid)</strong>
              <p class="hint" style="margin:5px 0 8px">ابتدا یک رمز بازیابی حداقل ۱۲ نویسه‌ای تعیین کنید. سپس کلید سازمانی بسازید و فایل کلید خصوصی را خارج از گوشی، نزد مدیر اصلی نگهداری کنید.</p>
              <label class="hint" for="backupRecoveryPassword">رمز بازیابی بکاپ</label>
              <input id="backupRecoveryPassword" type="password" minlength="12" autocomplete="new-password" placeholder="رمز بازیابی؛ حداقل ۱۲ نویسه" style="width:100%;margin:4px 0 6px" />
              <input id="backupRecoveryPasswordConfirm" type="password" minlength="12" autocomplete="new-password" placeholder="تکرار رمز بازیابی" style="width:100%;margin:0 0 8px" />
              <button type="button" class="btn btn-sm btn-secondary" id="btnSetupBackupPassword">تنظیم رمز بازیابی</button>
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
                <button type="button" class="btn btn-sm btn-secondary" id="btnGenerateOrgRecoveryKey">ساخت کلید سازمانی</button>
                <label class="btn btn-sm btn-secondary" for="orgRecoveryPublicKeyFile">واردکردن کلید عمومی سازمان</label>
                <input id="orgRecoveryPublicKeyFile" type="file" accept=".pem,.txt" hidden />
              </div>
              <p class="hint" id="backupCryptoStatus" role="status" style="margin:8px 0 0">وضعیت رمزنگاری: برای شروع، رمز بازیابی و کلید سازمانی را تنظیم کنید.</p>
            </div>
            <div class="backup-manager" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
                <strong>مدیریت نسخه‌های پشتیبان</strong>
                <button type="button" class="btn btn-sm btn-secondary" id="btnRefreshBackupList">به‌روزرسانی فهرست</button>
              </div>
              <p class="hint" id="backupHealthReport" role="status" aria-live="polite" style="margin:6px 0">گزارش آخرین پشتیبان: —</p>
              <div id="externalBackupList" style="display:grid;gap:8px;margin-top:8px">
                <p class="hint">برای مشاهده نسخه‌ها، فهرست را به‌روزرسانی کنید.</p>
              </div>
            </div>
          </div>

          
            </div>
          </details>
          <details class="settings-subfold">
            <summary class="settings-subfold-summary">هشدار سررسید و پیامک</summary>
            <div class="settings-subfold-body">
          <div class="card due-settings-card settings-inner-card" style="margin-top:8px;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--primary-soft)">
            <h3 style="margin:0 0 8px;font-size:1rem;color:var(--primary-dark);text-align:right">هشدار سررسید</h3>
            <label class="due-check-row" for="setDueReminderEnabled">
              <input type="checkbox" id="setDueReminderEnabled" />
              <span class="due-check-text">نمایش هشدار اسناد سررسیدشده هنگام ورود به برنامه</span>
            </label>
            <p class="hint" style="margin:0 0 12px;text-align:right">هشدار فقط با فعال‌سازی این گزینه نمایش داده می‌شود و برای جلوگیری از تکرار، در هر روز فقط یک‌بار نشان داده خواهد شد.</p>
            <label class="due-check-row" for="setDueNotificationEnabled">
              <input type="checkbox" id="setDueNotificationEnabled" />
              <span class="due-check-text">اعلان بومی اندروید برای سررسید اسناد</span>
            </label>
            <label class="field due-time-field" style="display:block;margin-bottom:12px;text-align:right">
              <span style="font-size:.82rem;font-weight:700;color:var(--primary-dark)">ساعت اعلان روز سررسید</span>
              <input type="time" id="setDueNotificationTime" value="09:00" class="due-time-input" />
              <span class="hint" style="font-size:.75rem;display:block;margin-top:4px">اعلان حتی در صورت بسته بودن برنامه، توسط اندروید نمایش داده می‌شود. در نسخه وب فقط هشدار هنگام ورود فعال است.</span>
            </label>
            <h3 style="margin:0 0 8px;font-size:1rem;color:var(--primary-dark);text-align:right">ارسال پیامک</h3>
            <p class="hint" style="margin:0 0 10px;text-align:right">اختیاری است. حالت «پیامک گوشی» بدون API کار می‌کند. برای ارسال خودکار: کاوه‌نگار، فراز اس‌ام‌اس، ملی‌پیامک یا آدرس سفارشی.</p>
            <label class="due-check-row" for="setSmsEnabled">
              <input type="checkbox" id="setSmsEnabled" />
              <span class="due-check-text">فعال‌سازی ارسال پیامک</span>
            </label>
            <label class="field" style="display:block;margin-bottom:8px">
              <span style="font-size:.82rem;font-weight:700;color:var(--text-soft)">روش ارسال</span>
              <select id="setSmsProvider" style="width:100%;margin-top:4px;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text)">
                <option value="device">پیامک گوشی (sms:)</option>
                <option value="kavenegar">کاوه‌نگار</option>
                <option value="faraz">فراز اس‌ام‌اس</option>
                <option value="melipayamak">ملی‌پیامک</option>
                <option value="custom">آدرس سفارشی (Webhook)</option>
              </select>
            </label>
            <label class="field" style="display:block;margin-bottom:8px">
              <span style="font-size:.82rem;font-weight:700;color:var(--text-soft)">نام کاربری (ملی‌پیامک)</span>
              <input id="setSmsUsername" placeholder="فقط برای ملی‌پیامک" style="width:100%;margin-top:4px;direction:ltr;text-align:left;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text)" autocomplete="off" />
            </label>
            <label class="field" style="display:block;margin-bottom:8px">
              <span style="font-size:.82rem;font-weight:700;color:var(--text-soft)">کلید API / رمز عبور</span>
              <input id="setSmsApiKey" type="password" placeholder="کاوه‌نگار / فراز / رمز ملی‌پیامک / توکن سفارشی" style="width:100%;margin-top:4px;direction:ltr;text-align:left;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text)" autocomplete="off" />
            </label>
            <label class="field" style="display:block;margin-bottom:8px">
              <span style="font-size:.82rem;font-weight:700;color:var(--text-soft)">شماره خط ارسال‌کننده (اختیاری)</span>
              <input id="setSmsSender" placeholder="مثلاً 1000..." style="width:100%;margin-top:4px;direction:ltr;text-align:left;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text)" />
            </label>
            <label class="field" style="display:block;margin-bottom:8px">
              <span style="font-size:.82rem;font-weight:700;color:var(--text-soft)">آدرس سرویس سفارشی</span>
              <input id="setSmsCustomUrl" placeholder="https://example.com/api/sms" style="width:100%;margin-top:4px;direction:ltr;text-align:left;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text)" />
            </label>
            <label class="field" style="display:block;margin-bottom:8px">
              <span style="font-size:.82rem;font-weight:700;color:var(--text-soft)">آدرس API زمان‌بندی پیامک (سمت سرور)</span>
              <input id="setSmsScheduleUrl" placeholder="https://example.com/api/sms/schedule" style="width:100%;margin-top:4px;direction:ltr;text-align:left;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text)" />
              <span class="hint" style="font-size:.75rem">این API باید پیام را در صف سرور ذخیره و در زمان تعیین‌شده ارسال کند؛ ارسال زمان‌بندی‌شده با بسته بودن برنامه نیز از سمت سرور انجام می‌شود.</span>
            </label>
            <label class="field" style="display:block;margin-bottom:8px">
              <span style="font-size:.82rem;font-weight:700;color:var(--text-soft)">توکن اختصاصی API زمان‌بندی</span>
              <input id="setSmsScheduleApiToken" type="password" autocomplete="off" placeholder="توکن امن API سرور شما" style="width:100%;margin-top:4px;direction:ltr;text-align:left;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text)" />
            </label>
            <label class="field" style="display:block;margin-bottom:8px">
              <span style="font-size:.82rem;font-weight:700;color:var(--text-soft)">الگوی پیام پیش‌فرض</span>
              <textarea id="setSmsDefaultTemplate" rows="3" placeholder="سلام {name}، مانده شما {balance} ریال است." style="width:100%;margin-top:4px;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text)"></textarea>
              <span class="hint" style="font-size:.75rem">متغیرها: {name} {amount} {date} {number} {balance} {business}</span>
            </label>
            <button type="button" class="btn btn-secondary btn-sm" id="btnSmsTest">ارسال پیامک آزمایشی</button>
          </div>

            </div>
          </details>

          <button class="btn btn-primary btn-block" id="btnSaveSettings" style="margin-top:12px">💾 ذخیره تنظیمات</button>
          <div class="actions" style="margin-top:12px">
            <button class="btn btn-secondary btn-block" id="btnClearCounts">پاک کردن همه شمارش‌ها</button>
            <button class="btn btn-secondary btn-block" id="btnZeroUncounted">صفر کردن شمارش‌نشده‌ها</button>
          </div>
        </div>

        <div class="card license-settings-card" style="margin-top:12px">
          <h2>لایسنس</h2>
          <p class="hint license-status-box" id="licenseDetail">—</p>
          <label class="field" style="margin-top:8px;display:block">
            <span style="font-size:.82rem;font-weight:700;color:var(--text-soft)">شناسه دستگاه</span>
            <input id="deviceIdDisplay" readonly style="width:100%;margin-top:4px;direction:ltr;text-align:left;font-family:monospace;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text)" />
          </label>
          <label class="field" style="margin-top:8px;display:block">
            <span style="font-size:.82rem;font-weight:700;color:var(--text-soft)">کلید لایسنس</span>
            <input id="licenseKeyInput" placeholder="ANB3...." style="width:100%;margin-top:4px;direction:ltr;text-align:left;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text)" />
          </label>
          <label class="field" style="margin-top:8px;display:block">
            <span style="font-size:.82rem;font-weight:700;color:var(--text-soft)">فایل لایسنس امضاشده (.anblic)</span>
            <p class="hint" style="margin:0 0 6px">فایل لایسنس صادرشده را انتخاب کنید. فایل با محتوای معتبر امضاشده بررسی می‌شود؛ پسوند فایل محدود نشده است.</p>
            <input id="offlineLicenseFile" type="file" style="width:100%;margin-top:4px" />
          </label>
          <div class="auto-backup-actions" style="margin-top:10px">
            <button type="button" class="btn btn-sm auto-backup-btn" id="btnActivateOfflineLicense" data-license-role="activate-file">فعال‌سازی لایسنس آفلاین (فایل)</button>
            <button type="button" class="btn btn-sm auto-backup-btn" id="btnActivateLicense" data-license-role="activate-key">فعال‌سازی کلید متنی (سازگاری)</button>
            <button type="button" class="btn btn-sm auto-backup-btn" id="btnDeactivateLicense" data-license-role="deactivate">حذف لایسنس</button>
            <button type="button" class="btn btn-sm auto-backup-btn" id="btnCopyDeviceId" data-license-role="copy-id">کپی شناسه دستگاه</button>
          </div>
        </div>

        <div class="card" style="margin-top:12px">
          <h2>همگام‌سازی تیمی</h2>
          <p class="hint" id="teamSyncInfo">—</p>
          <div style="display:flex;gap:8px;margin-top:8px;align-items:center">
            <input type="text" id="teamSessionCode" readonly style="flex:1;direction:ltr;text-align:left;font-family:monospace;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text)" />
            <button class="btn btn-sm btn-secondary" id="btnCopyTeamCode">کپی</button>
          </div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <input type="text" id="joinSessionInput" placeholder="کد جلسه برای پیوستن" style="flex:1;direction:ltr;text-align:left;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text)" />
            <button class="btn btn-sm btn-primary" id="btnJoinSession">پیوستن</button>
          </div>
          <label class="set-row" style="margin-top:10px">
            <span>حالت ادغام تداخل</span>
            <select id="teamMergeMode">
              <option value="sum">جمع (sum)</option>
              <option value="max">بیشینه (max)</option>
              <option value="incoming">فایل ورودی</option>
              <option value="local">مقدار محلی</option>
            </select>
          </label>
          <div class="card" style="margin-top:12px;padding:12px;background:var(--bg)">
            <h3 style="margin:0 0 8px">انتخاب روش همگام‌سازی تیمی</h3>
            <span class="settlement-method-label" style="margin-top:6px">روش کار</span>
            <div class="auto-backup-actions team-sync-mode-chips" role="radiogroup" aria-label="روش همگام‌سازی" style="margin:6px 0 10px">
              <button type="button" class="btn btn-sm auto-backup-btn" data-team-mode="offline" aria-pressed="false">آفلاین</button>
              <button type="button" class="btn btn-sm auto-backup-btn" data-team-mode="live" aria-pressed="false">آنلاین زنده</button>
              <button type="button" class="btn btn-sm auto-backup-btn" data-team-mode="hybrid" aria-pressed="false">ترکیبی</button>
            </div>
            <select id="teamSyncMode" hidden aria-hidden="true">
              <option value="offline">آفلاین — انتقال با فایل JSON</option>
              <option value="live">آنلاین زنده — همگام‌سازی خودکار</option>
              <option value="hybrid">ترکیبی — آنلاین خودکار + ابزار آفلاین</option>
            </select>
            <p class="hint">حالت آنلاین زنده در این نسخه با بررسی خودکار دوره‌ای Firebase کار می‌کند، نه WebSocket/Supabase. در حالت ترکیبی، فایل‌های JSON هم برای انتقال دستی در دسترس می‌مانند. در قطع اینترنت، شمارش محلی حفظ می‌شود.</p>
            <label class="field" style="display:block;margin-top:8px"><span>نشانی پایگاه داده آنلاین</span><input id="teamOnlineUrl" type="url" placeholder="https://your-project-default-rtdb.firebaseio.com" style="width:100%;direction:ltr;text-align:left" /></label>
            <label class="field" style="display:block;margin-top:8px"><span>توکن دسترسی (در صورت نیاز)</span><input id="teamOnlineToken" type="password" placeholder="اختیاری؛ مطابق تنظیمات پایگاه داده" style="width:100%;direction:ltr;text-align:left" autocomplete="off" /></label>
            <div class="auto-backup-actions" style="margin-top:8px">
              <button type="button" class="btn btn-sm auto-backup-btn" id="btnSaveTeamOnline" data-team-action="save-online">ذخیره تنظیمات آنلاین</button>
              <button type="button" class="btn btn-sm auto-backup-btn auto-backup-btn-run" id="btnSyncTeamOnline" data-team-action="sync-now">همگام‌سازی آنلاین اکنون</button>
            </div>
            <p class="hint auto-backup-status" id="teamOnlineStatus" role="status" aria-live="polite">همگام‌سازی آنلاین تنظیم نشده است.</p>
          </div>
          <div class="auto-backup-actions" style="margin-top:12px">
            <button type="button" class="btn btn-sm auto-backup-btn" id="btnExportTeam" data-team-action="export-pack">📤 ارسال بسته همگام‌سازی</button>
            <button type="button" class="btn btn-sm auto-backup-btn" id="btnImportTeam" data-team-action="import-pack">📥 دریافت و ادغام بسته</button>
            <input type="file" id="teamSyncFile" accept=".json" style="display:none" />
            <button type="button" class="btn btn-sm auto-backup-btn" id="btnExportPartial" data-team-action="export-partial">📤 خروجی شمارش این دستگاه</button>
            <button type="button" class="btn btn-sm auto-backup-btn" id="btnExportMergeReport" data-team-action="export-report">📄 گزارش آخرین ادغام</button>
          </div>
        </div>

        <div class="card" style="margin-top:12px">
          <h2>ورود و خروجی</h2>
          <p class="hint">پشتیبانی از XLSX، CSV و JSON</p>
          <div class="actions" style="margin-top:12px">
            <button class="btn btn-primary btn-block" id="btnImport">📥 ورود از فایل</button>
            <input type="file" id="importFile" accept=".xlsx,.xls,.csv,.txt,.json" style="display:none" />
            <button class="btn btn-success btn-block" id="btnExportExcel">📥 دانلود اکسل کامل</button>
            <button class="btn btn-primary btn-block" id="btnExportDiff">📥 دانلود فقط مغایرت‌ها</button>
            <button class="btn btn-secondary btn-block" id="btnExportCsv">📄 دانلود CSV</button>
            <button class="btn btn-secondary btn-block" id="btnExportPhotos">🖼 خروجی بسته عکس‌ها</button>
            <button class="btn btn-secondary btn-block" id="btnImportPhotos">📥 ورود بسته عکس‌ها</button>
            <input type="file" id="photoPackFile" accept=".json" style="display:none" />
          </div>
          <p class="hint" id="importStatus" style="margin-top:8px"></p>
          <p class="hint" id="photoCountInfo" style="margin-top:4px"></p>
        </div>
      </section>
    </main>

    <!-- Scanner Modal -->
    <div id="scannerModal" class="modal-overlay scanner-modal">
      <div class="modal-sheet">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <strong id="scannerTitle">اسکن بارکد</strong>
          <button class="btn btn-sm btn-secondary" id="btnCloseScanner">بستن</button>
        </div>
        <div id="scanner-container"></div>
        <div class="scanner-toolbar">
          <button class="btn btn-sm btn-secondary" id="torchBtn">🔦 نور</button>
          <button class="btn btn-sm btn-secondary" id="btnRestartCam">🔄 راه‌اندازی مجدد</button>
          <label style="display:flex;align-items:center;gap:6px;font-size:0.82rem;margin-right:auto">
            <input type="checkbox" id="scannerContinuous" checked /> پیوسته
          </label>
        </div>
        <div class="manual-row">
          <input type="text" id="manualBarcode" placeholder="ورود دستی بارکد..." inputmode="text" autocomplete="off" />
          <button class="btn btn-primary btn-sm" id="btnManualSubmit">ثبت</button>
        </div>
      </div>
    </div>

    <!-- Qty Modal -->
    <div id="qtyModal" class="modal-overlay qty-modal">
      <div class="modal-card">
        <div id="qtyModalName" style="font-size:1.15rem;font-weight:800;color:var(--primary-deeper)"></div>
        <div id="qtyModalMeta" class="hint" style="margin-top:4px"></div>
        <div class="qty-controls">
          <button class="btn btn-secondary qty-step" id="qtyMinus" aria-label="کم کردن تعداد">−</button>
          <input type="number" id="qtyModalInput" min="0" step="any" inputmode="decimal" class="qty-input" />
          <button class="btn btn-secondary qty-step" id="qtyPlus" aria-label="زیاد کردن تعداد">+</button>
        </div>
        <div id="qtyModalDiff" style="text-align:center;font-size:.85rem;margin:10px 0;min-height:22px"></div>
        <div style="display:flex;gap:8px;margin-bottom:10px">
          <button class="btn btn-sm btn-secondary" id="qtyModalEqBtn" style="flex:1">= سیستم</button>
          <button class="btn btn-sm btn-secondary" id="qtySet0" style="flex:1">۰</button>
          <button class="btn btn-sm btn-secondary" id="qtySet1" style="flex:1">۱</button>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary" id="qtyCancel" style="flex:1">انصراف</button>
          <button class="btn btn-primary" id="qtyConfirm" style="flex:1.4">✓ تأیید</button>
        </div>
      </div>
    </div>

    <nav class="nav">
      <button class="nav-item active" data-page="count">شمارش</button>
      <button class="nav-item" data-page="products">کالاها</button>
      <button class="nav-item" data-page="reports">گزارش</button>
      <button class="nav-item" data-page="accounting">حسابداری</button>
      <button class="nav-item" data-page="health">سلامت داده</button>
      <button class="nav-item" data-page="audit">لاگ</button>
      <button class="nav-item" data-page="admin">تنظیمات</button>
    </nav>
  `;


  // دسته‌بندی جمع‌وجور تنظیمات؛ محتوای اصلی و شناسه کنترل‌ها بدون تغییر می‌مانند.
  compactAdminSections();
  compactReportSections();
  bindEvents();
  setupVirtualLists();
}


function compactAdminSections(): void {
  const page = document.getElementById('page-admin');
  if (!page) return;
  const cards = Array.from(page.children).filter((node): node is HTMLElement =>
    node instanceof HTMLElement && node.classList.contains('card')
  );
  const icons = ['📊', '⚙️', '🔐', '🔄', '💾'];
  cards.forEach((card, index) => {
    const heading = card.querySelector(':scope > h2');
    if (!heading) return;
    const title = heading.textContent?.trim() || 'بخش تنظیمات';
    const details = document.createElement('details');
    details.className = 'settings-category';
    // فقط وضعیت سیستم باز؛ بقیه جمع تا صفحه کوتاه‌تر باشد
    details.open = index === 0;
    const summary = document.createElement('summary');
    summary.className = 'category-summary';
    summary.innerHTML = `<span class="category-icon" aria-hidden="true">${icons[index] || '🧩'}</span><span class="category-title"></span><span class="category-chevron" aria-hidden="true">⌄</span>`;
    summary.querySelector('.category-title')!.textContent = title;
    const body = document.createElement('div');
    body.className = 'category-content';
    Array.from(card.childNodes).forEach((child) => {
      if (child === heading) return;
      body.appendChild(child);
    });
    details.append(summary, body);
    card.replaceWith(details);
  });
}

function compactReportSections(): void {
  // صفحه گزارش از قبل با details و شبکه فشرده چیده شده؛ فقط کلاس یکدست می‌شود.
  const page = document.getElementById('page-reports');
  page?.querySelectorAll('details.report-fold > summary').forEach((summary) => {
    summary.classList.add('category-summary');
  });
}

