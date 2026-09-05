// UBL 2.1 — the syntax Peppol, XRechnung (UBL flavour) and most of northern Europe use.
//
// Element order is fixed by the schema and a validator rejects a file for a misplaced child, so
// every block below is written in schema order and nothing is appended conditionally out of it.
// Optional elements are handed to the builder as nulls and vanish; see ./xml.js.

import { el, opt, toXml, amt, num } from './xml.js';

const NS = {
  'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
};

const money = (name, value, currency) => el(name, { currencyID: currency }, amt(value));

function taxCategory(cat, withReason = false) {
  return el('cac:TaxCategory',
    el('cbc:ID', cat.id),
    el('cbc:Percent', num(cat.rate)),
    withReason ? opt('cbc:TaxExemptionReasonCode', cat.reasonCode) : null,
    withReason ? opt('cbc:TaxExemptionReason', cat.reason) : null,
    el('cac:TaxScheme', el('cbc:ID', 'VAT')),
  );
}

function address(p) {
  return el('cac:PostalAddress',
    opt('cbc:StreetName', p.street),
    opt('cbc:AdditionalStreetName', p.street2),
    opt('cbc:CityName', p.city),
    opt('cbc:PostalZone', p.postcode),
    opt('cbc:CountrySubentity', p.region),
    el('cac:Country', opt('cbc:IdentificationCode', p.country)),
  );
}

function partyBlock(role, p) {
  return el(role, el('cac:Party',
    p.endpoint ? el('cbc:EndpointID', { schemeID: p.endpoint.scheme }, p.endpoint.value) : null,
    el('cac:PartyName', opt('cbc:Name', p.name)),
    address(p),
    p.vatId ? el('cac:PartyTaxScheme', el('cbc:CompanyID', p.vatId), el('cac:TaxScheme', el('cbc:ID', 'VAT'))) : null,
    el('cac:PartyLegalEntity',
      opt('cbc:RegistrationName', p.name),
      p.taxId ? el('cbc:CompanyID', p.taxId) : null,
      opt('cbc:CompanyLegalForm', p.legalText),
    ),
    el('cac:Contact', opt('cbc:Name', p.name), opt('cbc:Telephone', p.phone), opt('cbc:ElectronicMail', p.email)),
  ));
}

/**
 * The document as UBL.
 *
 * An invoice is `<Invoice>`, a credit note `<CreditNote>` — different root, different type-code
 * element, different line element, and no due date on a credit note because the schema has
 * none. Everything else is shared.
 */
export function toUbl(m) {
  const credit = m.kind === 'credit_note';
  const cur = m.currency;
  const root = credit ? 'CreditNote' : 'Invoice';
  const ns = { xmlns: `urn:oasis:names:specification:ubl:schema:xsd:${root}-2`, ...NS };

  const lines = m.lines.map((l) => el(credit ? 'cac:CreditNoteLine' : 'cac:InvoiceLine',
    el('cbc:ID', l.id),
    el(credit ? 'cbc:CreditedQuantity' : 'cbc:InvoicedQuantity', { unitCode: l.unitCode }, num(l.quantity)),
    money('cbc:LineExtensionAmount', l.net, cur),
    l.allowance ? el('cac:AllowanceCharge',
      el('cbc:ChargeIndicator', 'false'),
      el('cbc:AllowanceChargeReason', 'Discount'),
      money('cbc:Amount', l.allowance, cur),
    ) : null,
    l.charge ? el('cac:AllowanceCharge',
      el('cbc:ChargeIndicator', 'true'),
      el('cbc:AllowanceChargeReason', 'Adjustment'),
      money('cbc:Amount', l.charge, cur),
    ) : null,
    el('cac:Item',
      el('cbc:Name', l.name),
      el('cac:ClassifiedTaxCategory', el('cbc:ID', l.category.id), el('cbc:Percent', num(l.category.rate)), el('cac:TaxScheme', el('cbc:ID', 'VAT'))),
    ),
    el('cac:Price', money('cbc:PriceAmount', l.unitPrice, cur)),
  ));

  const doc = el(root, ns,
    el('cbc:CustomizationID', m.profile.customization),
    opt('cbc:ProfileID', m.profile.profileId),
    el('cbc:ID', m.number),
    el('cbc:IssueDate', m.issueDate),
    !credit ? opt('cbc:DueDate', m.dueDate) : null,
    el(credit ? 'cbc:CreditNoteTypeCode' : 'cbc:InvoiceTypeCode', m.typeCode),
    opt('cbc:Note', m.note),
    el('cbc:DocumentCurrencyCode', cur),
    opt('cbc:BuyerReference', m.buyerReference),
    m.precedingInvoice ? el('cac:BillingReference', el('cac:InvoiceDocumentReference', el('cbc:ID', m.precedingInvoice))) : null,
    partyBlock('cac:AccountingSupplierParty', m.seller),
    partyBlock('cac:AccountingCustomerParty', m.buyer),
    // Schema order: Delivery sits between the customer party and the payment means.
    m.deliveryDate ? el('cac:Delivery', el('cbc:ActualDeliveryDate', m.deliveryDate)) : null,
    el('cac:PaymentMeans',
      el('cbc:PaymentMeansCode', m.payment.code),
      opt('cbc:PaymentID', m.payment.reference),
      m.payment.iban ? el('cac:PayeeFinancialAccount',
        el('cbc:ID', m.payment.iban),
        opt('cbc:Name', m.payment.accountHolder),
        m.payment.bic ? el('cac:FinancialInstitutionBranch', el('cbc:ID', m.payment.bic)) : null,
      ) : null,
    ),
    m.paymentTerms ? el('cac:PaymentTerms', el('cbc:Note', m.paymentTerms)) : null,
    m.shipping ? el('cac:AllowanceCharge',
      el('cbc:ChargeIndicator', 'true'),
      el('cbc:AllowanceChargeReason', m.shipping.reason),
      money('cbc:Amount', m.shipping.amount, cur),
      taxCategory(m.shipping.category),
    ) : null,
    el('cac:TaxTotal',
      money('cbc:TaxAmount', m.totals.taxTotal, cur),
      ...m.breakdown.map((b) => el('cac:TaxSubtotal',
        money('cbc:TaxableAmount', b.basis, cur),
        money('cbc:TaxAmount', b.tax, cur),
        taxCategory(b, true),
      )),
    ),
    el('cac:LegalMonetaryTotal',
      money('cbc:LineExtensionAmount', m.totals.lineExtension, cur),
      money('cbc:TaxExclusiveAmount', m.totals.taxExclusive, cur),
      money('cbc:TaxInclusiveAmount', m.totals.taxInclusive, cur),
      m.totals.chargeTotal ? money('cbc:ChargeTotalAmount', m.totals.chargeTotal, cur) : null,
      m.totals.prepaid ? money('cbc:PrepaidAmount', m.totals.prepaid, cur) : null,
      money('cbc:PayableAmount', m.totals.payable, cur),
    ),
    ...lines,
  );

  return toXml(doc);
}
