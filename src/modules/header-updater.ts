/** به‌روزرسانی آمار سربرگ، وضعیت نشست و پنل‌های خلاصه برنامه. */
import { getCountStats, settings, storageBackend } from './state';
import { formatFaNumber } from '../utils/helpers';
import { getSessionLabel } from './session-settings';
import { renderReportHTML, renderStockAlertsPanel } from './reports';
import { countPhotos } from './photos';
import { refreshTeamSyncUI, refreshTeamOnlineStatus } from './team-sync';
import { updateLicenseUI } from './license';
import { applyRoleUI } from './filters-roles';
import { renderManagementPanels } from './management-panels';

/**
 * سربرگ و پنل‌های وابسته را با داده‌های جاری تازه می‌کند.
 * هر بخش مستقل و اختیاری است تا نبودن یک عنصر DOM مانع سایر به‌روزرسانی‌ها نشود.
 */
export function updateHeader(root: Document = document): void {
  const stats = getCountStats();
  const headerStats = root.getElementById('headerStats');
  if (headerStats) {
    headerStats.innerHTML = `<span>${formatFaNumber(stats.counted)} / ${formatFaNumber(stats.total)}</span>`;
  }

  const statsBox = root.getElementById('statsBox');
  if (statsBox) {
    statsBox.innerHTML = `
      <div class="stat-card"><div class="stat-value">${formatFaNumber(stats.total)}</div><div class="stat-label">کل کالا</div></div>
      <div class="stat-card"><div class="stat-value">${formatFaNumber(stats.counted)}</div><div class="stat-label">شمارش‌شده</div></div>
      <div class="stat-card"><div class="stat-value">${formatFaNumber(stats.diffs)}</div><div class="stat-label">مغایرت</div></div>
      <div class="stat-card"><div class="stat-value">${formatFaNumber(stats.withPhoto)}</div><div class="stat-label">با عکس</div></div>
    `;
  }

  const sessionLabel = getSessionLabel();
  const sessionHint = root.getElementById('sessionHint');
  if (sessionHint) sessionHint.textContent = sessionLabel;
  const session = root.getElementById('sessionLabel');
  if (session) session.textContent = sessionLabel;

  const phaseBar = root.getElementById('phaseBar') as HTMLElement | null;
  if (phaseBar) phaseBar.style.display = settings.doubleCount ? 'flex' : 'none';

  const storageInfo = root.getElementById('storageInfo');
  if (storageInfo) storageInfo.textContent = String(storageBackend);
  const warehouseInfo = root.getElementById('warehouseInfo');
  if (warehouseInfo) warehouseInfo.textContent = settings.currentWarehouse || '—';
  const roleInfo = root.getElementById('roleInfo');
  if (roleInfo) roleInfo.textContent = settings.role || '—';
  const doubleInfo = root.getElementById('doubleInfo');
  if (doubleInfo) doubleInfo.textContent = settings.doubleCount ? 'فعال' : 'غیرفعال';

  renderManagementPanels(root);
  const reportSummary = root.getElementById('reportSummary');
  if (reportSummary) reportSummary.innerHTML = renderReportHTML();
  const alertsPanel = root.getElementById('stockAlertsPanel');
  if (alertsPanel) alertsPanel.innerHTML = renderStockAlertsPanel();

  const photoCountInfo = root.getElementById('photoCountInfo');
  if (photoCountInfo) photoCountInfo.textContent = 'عکس‌های ذخیره‌شده: ' + countPhotos();
  refreshTeamSyncUI();
  refreshTeamOnlineStatus();
  updateLicenseUI();
  applyRoleUI();
}
