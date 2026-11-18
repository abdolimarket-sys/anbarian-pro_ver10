/**
 * نمای عمومی دامنه بازرگانی/مالی — بدون DOM.
 * UI باید از اینجا مصرف کند، نه از جزئیات storage.
 */

export {
  // عملیات حساس
  postInvoice,
  createCashTransaction,
  updateChequeStatus,
  postInventoryNrvWriteDown,
  recoverPendingCommerceOperation,
  runFinancialIntegrityOnBoot,
  reconcileProductStockFromCosting,
  withCommerceMutationLock,
  // داده
  loadCommerceData,
  saveCommerceData,
  ensureCommerceAccounts,
  emptyCommerceData,
  ensureDefaultParties,
  assertDefaultPartyAllowed,
  checkDefaultPartyPolicy,
  // فاکتور / طرف حساب
  buildInvoice,
  updateDraftInvoice,
  upsertParty,
  invoiceOutstanding,
  partyBalance,
  allocateLandedCostsToLines,
  totalLandedCostRial,
  recordOperatingEntry,
  listOperatingEntries,
  // ثابت‌ها و type helpers
  DEFAULT_CUSTOMER_PARTY_ID,
  DEFAULT_SUPPLIER_PARTY_ID,
  isSaleInvoiceType,
  isPurchaseInvoiceType,
  isReturnInvoiceType,
  // types
  type PartyType,
  type InvoiceType,
  type CommercialStatus,
  type AccountingParty,
  type CommercialInvoiceLine,
  type InvoicePaymentPart,
  type InvoiceLandedCosts,
  type CommercialInvoice,
  type SettlementMethod,
  type ChequeStatus,
  type InvoiceAllocation,
  type CashTransaction,
  type ChequeEndorsement,
  type CommerceData,
} from './accounting-commerce';

export {
  endorseCheque,
  getChequeEndorsement,
  getChequeEndorsements,
  getChequeEndorsementRemaining,
} from './accounting-cheque-endorsement';

export {
  commitFinancialDomains,
  commitRestoredFinancialSnapshot,
  beginCommerceOperation,
  readPendingCommerceOperation,
  type CommerceOperationKind,
  type PendingCommerceOperation,
} from './financial-commit';

export {
  getTruthQty,
  getTruthBalance,
  syncProductCardsFromCostingTruth,
  listStockDivergences,
  applyCostingBalancesToProducts,
} from './inventory-truth';

export {
  loadInventoryCostData,
  getCostBalance,
  type InventoryCostData,
} from './inventory-costing';
