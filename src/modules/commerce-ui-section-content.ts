/**
 * قرارداد بارگذاری محتوای بخش‌های بازرگانی.
 * UI اصلی loaderها را ثبت می‌کند؛ برگه/fallback بدون دانستن جزئیات دامنه کار می‌کند.
 */
import type { CommercePanelSection } from './commerce-ui-panel-render';

export type SectionContentLoader = () => Promise<string>;

const loaders = new Map<string, SectionContentLoader>();

export function registerCommerceSectionLoader(
  section: CommercePanelSection | string,
  loader: SectionContentLoader,
): void {
  loaders.set(section, loader);
}

export function getCommerceSectionLoader(
  section: CommercePanelSection | string,
): SectionContentLoader | undefined {
  return loaders.get(section);
}

export async function loadCommerceSectionHtml(
  section: CommercePanelSection | string,
  fallbackHtml: string,
): Promise<{ html: string; fromLoader: boolean }> {
  const loader = loaders.get(section);
  if (!loader) return { html: fallbackHtml, fromLoader: false };
  try {
    const html = await loader();
    if (html && html.trim()) return { html, fromLoader: true };
    return { html: fallbackHtml, fromLoader: true };
  } catch (e) {
    console.error('[Anbarin] section loader failed', section, e);
    const msg = e instanceof Error ? e.message : 'خطای ناشناخته';
    return {
      html:
        `<div class="card" style="margin-top:12px"><p class="hint" style="color:var(--danger,#c43b35)">` +
        `بارگذاری بخش «${section}» ناموفق بود: ${msg}</p></div>`,
      fromLoader: true,
    };
  }
}
