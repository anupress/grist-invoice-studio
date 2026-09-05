// UN/CEFACT Cross Industry Invoice — the syntax inside Factur-X and ZUGFeRD, and XRechnung's
// second flavour.
//
// Same warning as ./ubl.js: the schema fixes the order of every child, and a validator refuses a
// file for a misplaced one. The blocks below follow the D16B schema order exactly.

import { el, opt, toXml, amt, num } from './xml.js';

const NS = {
  'xmlns:rsm': 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
  'xmlns:ram': 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
  'xmlns:udt': 'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100',
  'xmlns:qdt': 'urn:un:unece:uncefact:data:standard:QualifiedDataType:100',
};

/** CII dates are "102" format: YYYYMMDD, no separators. */
const date102 = (iso) => (iso ? el('udt:DateTimeString', { format: '102' }, iso.replace(/-/g, '')) : null);

function tradeParty(name, p) {
  return el(name,
    el('ram:Name', p.name || '—'),
    p.legalText ? el('ram:SpecifiedLegalOrganization', el('ram:TradingBusinessName', p.legalText)) : null,
    (p.phone || p.email) ? el('ram:DefinedTradeContact',
      opt('ram:PersonName', p.name),
      p.phone ? el('ram:TelephoneUniversalCommunication', el('ram:CompleteNumber', p.phone)) : null,
      p.email ? el('ram:EmailURIUniversalCommunication', el('ram:URIID', p.email)) : null,
    ) : null,
    el('ram:PostalTradeAddress',
      opt('ram:PostcodeCode', p.postcode),
      opt('ram:LineOne', p.street),
      opt('ram:LineTwo', p.street2),
      opt('ram:CityName', p.city),
      opt('ram:CountryID', p.country),
      opt('ram:CountrySubDivisionName', p.region),
    ),
    p.endpoint ? el('ram:URIUniversalCommunication', el('ram:URIID', { schemeID: p.endpoint.scheme }, p.endpoint.value)) : null,
    p.taxId ? el('ram:SpecifiedTaxRegistration', el('ram:ID', { schemeID: 'FC' }, p.taxId)) : null,
    p.vatId ? el('ram:SpecifiedTaxRegistration', el('ram:ID', { schemeID: 'VA' }, p.vatId)) : null,
  );
}

function lineTax(cat) {
  return el('ram:ApplicableTradeTax',
    el('ram:TypeCode', 'VAT'),
    opt('ram:ExemptionReason', cat.reason),
    el('ram:CategoryCode', cat.id),
    el('ram:RateApplicablePercent', num(cat.rate)),
  );
}

function headerTax(b, cur) {
  return el('ram:ApplicableTradeTax',
    el('ram:CalculatedAmount', amt(b.tax)),
    el('ram:TypeCode', 'VAT'),
    opt('ram:ExemptionReason', b.reason),
    el('ram:BasisAmount', amt(b.basis)),
    el('ram:CategoryCode', b.id),
    opt('ram:ExemptionReasonCode', b.reasonCode),
    el('ram:RateApplicablePercent', num(b.rate)),
  );
}

function allowanceCharge(isCharge, amount, reason, cat) {
  return el('ram:SpecifiedTradeAllowanceCharge',
    el('ram:ChargeIndicator', el('udt:Indicator', isCharge ? 'true' : 'false')),
    el('ram:ActualAmount', amt(amount)),
    el('ram:Reason', reason),
    cat ? el('ram:CategoryTradeTax',
      el('ram:TypeCode', 'VAT'),
      el('ram:CategoryCode', cat.id),
      el('ram:RateApplicablePercent', num(cat.rate)),
    ) : null,
  );
}

/** The document as CII. */
export function toCii(m) {
  const cur = m.currency;

  const lines = m.lines.map((l) => el('ram:IncludedSupplyChainTradeLineItem',
    el('ram:AssociatedDocumentLineDocument', el('ram:LineID', l.id)),
    el('ram:SpecifiedTradeProduct', el('ram:Name', l.name)),
    el('ram:SpecifiedLineTradeAgreement',
      el('ram:NetPriceProductTradePrice', el('ram:ChargeAmount', amt(l.unitPrice))),
    ),
    el('ram:SpecifiedLineTradeDelivery', el('ram:BilledQuantity', { unitCode: l.unitCode }, num(l.quantity))),
    el('ram:SpecifiedLineTradeSettlement',
      lineTax(l.category),
      l.allowance ? allowanceCharge(false, l.allowance, 'Discount', null) : null,
      l.charge ? allowanceCharge(true, l.charge, 'Adjustment', null) : null,
      el('ram:SpecifiedTradeSettlementLineMonetarySummation', el('ram:LineTotalAmount', amt(l.net))),
    ),
  ));

  const doc = el('rsm:CrossIndustryInvoice', NS,
    el('rsm:ExchangedDocumentContext',
      m.profile.profileId ? el('ram:BusinessProcessSpecifiedDocumentContextParameter', el('ram:ID', m.profile.profileId)) : null,
      el('ram:GuidelineSpecifiedDocumentContextParameter', el('ram:ID', m.profile.customization)),
    ),
    el('rsm:ExchangedDocument',
      el('ram:ID', m.number),
      el('ram:TypeCode', m.typeCode),
      el('ram:IssueDateTime', date102(m.issueDate)),
      m.note ? el('ram:IncludedNote', el('ram:Content', m.note)) : null,
    ),
    el('rsm:SupplyChainTradeTransaction',
      ...lines,
      el('ram:ApplicableHeaderTradeAgreement',
        opt('ram:BuyerReference', m.buyerReference),
        tradeParty('ram:SellerTradeParty', m.seller),
        tradeParty('ram:BuyerTradeParty', m.buyer),
      ),
      // Required by the schema even when empty of content; the builder drops an empty element, so
      // the delivery block carries the delivery date as the event — the document's service date,
      // or the issue date standing in for it.
      el('ram:ApplicableHeaderTradeDelivery',
        el('ram:ActualDeliverySupplyChainEvent', el('ram:OccurrenceDateTime', date102(m.deliveryDate))),
      ),
      el('ram:ApplicableHeaderTradeSettlement',
        opt('ram:PaymentReference', m.payment.reference),
        el('ram:InvoiceCurrencyCode', cur),
        el('ram:SpecifiedTradeSettlementPaymentMeans',
          el('ram:TypeCode', m.payment.code),
          m.payment.iban ? el('ram:PayeePartyCreditorFinancialAccount',
            el('ram:IBANID', m.payment.iban),
            opt('ram:AccountName', m.payment.accountHolder),
          ) : null,
          m.payment.bic ? el('ram:PayeeSpecifiedCreditorFinancialInstitution', el('ram:BICID', m.payment.bic)) : null,
        ),
        ...m.breakdown.map((b) => headerTax(b, cur)),
        m.shipping ? allowanceCharge(true, m.shipping.amount, m.shipping.reason, m.shipping.category) : null,
        el('ram:SpecifiedTradePaymentTerms',
          opt('ram:Description', m.paymentTerms),
          m.dueDate ? el('ram:DueDateDateTime', date102(m.dueDate)) : null,
        ),
        el('ram:SpecifiedTradeSettlementHeaderMonetarySummation',
          el('ram:LineTotalAmount', amt(m.totals.lineExtension)),
          m.totals.chargeTotal ? el('ram:ChargeTotalAmount', amt(m.totals.chargeTotal)) : null,
          el('ram:TaxBasisTotalAmount', amt(m.totals.taxExclusive)),
          el('ram:TaxTotalAmount', { currencyID: cur }, amt(m.totals.taxTotal)),
          el('ram:GrandTotalAmount', amt(m.totals.taxInclusive)),
          m.totals.prepaid ? el('ram:TotalPrepaidAmount', amt(m.totals.prepaid)) : null,
          el('ram:DuePayableAmount', amt(m.totals.payable)),
        ),
        m.precedingInvoice ? el('ram:InvoiceReferencedDocument', el('ram:IssuerAssignedID', m.precedingInvoice)) : null,
      ),
    ),
  );

  return toXml(doc);
}
