/** مدیریت رندر پنل‌های مدیریتی، گردش موجودی و تاریخچه فعالیت. */
import {
  renderManagementDashboard,
  renderInventoryMovementPanel,
  renderActivityHistoryPanel,
} from './reports';

/** پنل‌های مدیریتی را فقط در صورت وجود محل نمایش به‌روزرسانی می‌کند. */
export function renderManagementPanels(root: Document = document): void {
  const dashboard = root.getElementById('managementDashboard');
  if (dashboard) dashboard.innerHTML = renderManagementDashboard();

  const movementPanel = root.getElementById('inventoryMovementPanel');
  if (movementPanel) movementPanel.innerHTML = renderInventoryMovementPanel();

  const activityPanel = root.getElementById('activityHistoryPanel');
  if (activityPanel) activityPanel.innerHTML = renderActivityHistoryPanel();
}
