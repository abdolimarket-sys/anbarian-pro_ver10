/** کش مستقل دوره‌های مالی مورد استفاده رابط بازرگانی. */
import { loadAccountingData } from './accounting';
import { esc } from './commerce-ui-shared';

export interface CommerceFiscalPeriodCacheItem {
  id:string;
  startDate:string;
  endDate:string;
  status:string;
}

let periods:CommerceFiscalPeriodCacheItem[]=[];
let periodOptions='';
let refreshSequence=0;

export async function refreshCommerceFiscalCache():Promise<void>{
  const request=++refreshSequence;
  try{
    const accounting=await loadAccountingData();
    if(request!==refreshSequence)return;
    periods=accounting.fiscalPeriods.map(p=>({id:p.id,startDate:p.startDate,endDate:p.endDate,status:p.status}));
    periodOptions=accounting.fiscalPeriods.filter(p=>p.status==='open')
      .map(p=>`<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('');
  }catch(error){
    console.warn('[anbarin] refreshCommerceFiscalCache',error);
  }
}

export function getCommerceFiscalPeriods():CommerceFiscalPeriodCacheItem[]{
  return periods.map(p=>({...p}));
}

export function getCommercePeriodOptions():string{
  return periodOptions;
}
