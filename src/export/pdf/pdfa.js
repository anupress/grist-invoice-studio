// PDF/A-3, with an e-invoice inside.
//
// Factur-X and ZUGFeRD are one idea: a PDF a person reads with the same invoice as XML embedded
// in it for a machine to read, wrapped as PDF/A-3 so the pair is archival. What PDF/A-3 adds to
// an ordinary PDF is a short list, and every item is here:
//
//   • XMP metadata that says "this is PDF/A-3B", repeats the title, author and dates from the
//     Info dictionary, and — for Factur-X — names the embedded file and its conformance level
//     through an extension schema the metadata itself declares
//   • an output intent: an sRGB profile that pins down what the colours mean
//   • the embedded file, declared as an associated file (/AF) of the document with a relationship
//     of Alternative — "this XML is the same invoice", which is what the EN 16931 profile requires
//   • a file identifier in the trailer, and a header of 1.7
//   • every font embedded, which the caller guarantees by handing the writer the embedded family
//
// It is a writer plugin: it says how many objects it needs and writes them once it knows their
// numbers, and the writer splices its additions into the catalogue. See writer.js.

import { sRGBProfile } from './icc.js';
import { pdfDate } from './writer.js';

const xmlEsc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const utf8 = (s) => new TextEncoder().encode(s);

/** An ISO instant to the second, in UTC, which is the form XMP wants. */
const isoInstant = (d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

/** A sixteen-byte identifier from a string, as hex. Not cryptographic; distinct is all it need be. */
export function fileIdFor(seed) {
  let h1 = 0x811c9dc5, h2 = 0x01000193, h3 = 0xdeadbeef, h4 = 0x9e3779b9;
  for (const ch of String(seed)) {
    const c = ch.codePointAt(0);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
    h3 = (Math.imul(h3 ^ (c << 5), 0xc2b2ae35) + 7) >>> 0;
    h4 = Math.imul(h4 + (c * 31), 0x27d4eb2f) >>> 0;
  }
  return [h1, h2, h3, h4].map((n) => n.toString(16).padStart(8, '0')).join('').toUpperCase();
}

/**
 * The XMP packet.
 *
 * The Factur-X block is only written when there is an embedded invoice; a plain PDF/A-3 (an
 * archival copy with nothing inside) carries the rest.
 */
function xmpPacket({ title, author, created, producer, facturx }) {
  const when = isoInstant(created);
  const fx = facturx ? `
  <rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
   <pdfaExtension:schemas>
    <rdf:Bag>
     <rdf:li rdf:parseType="Resource">
      <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
      <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
      <pdfaSchema:prefix>fx</pdfaSchema:prefix>
      <pdfaSchema:property>
       <rdf:Seq>
        <rdf:li rdf:parseType="Resource"><pdfaProperty:name>DocumentFileName</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>name of the embedded XML invoice file</pdfaProperty:description></rdf:li>
        <rdf:li rdf:parseType="Resource"><pdfaProperty:name>DocumentType</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>INVOICE</pdfaProperty:description></rdf:li>
        <rdf:li rdf:parseType="Resource"><pdfaProperty:name>Version</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>The actual version of the Factur-X XML schema</pdfaProperty:description></rdf:li>
        <rdf:li rdf:parseType="Resource"><pdfaProperty:name>ConformanceLevel</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>The conformance level of the embedded Factur-X data</pdfaProperty:description></rdf:li>
       </rdf:Seq>
      </pdfaSchema:property>
     </rdf:li>
    </rdf:Bag>
   </pdfaExtension:schemas>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
   <fx:DocumentType>${facturx.documentType}</fx:DocumentType>
   <fx:DocumentFileName>${xmlEsc(facturx.fileName)}</fx:DocumentFileName>
   <fx:Version>1.0</fx:Version>
   <fx:ConformanceLevel>${xmlEsc(facturx.conformance)}</fx:ConformanceLevel>
  </rdf:Description>` : '';

  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
   <pdfaid:part>3</pdfaid:part>
   <pdfaid:conformance>B</pdfaid:conformance>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlEsc(title)}</rdf:li></rdf:Alt></dc:title>
   <dc:creator><rdf:Seq><rdf:li>${xmlEsc(author)}</rdf:li></rdf:Seq></dc:creator>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
   <xmp:CreatorTool>${xmlEsc(producer)}</xmp:CreatorTool>
   <xmp:CreateDate>${when}</xmp:CreateDate>
   <xmp:ModifyDate>${when}</xmp:ModifyDate>
   <xmp:MetadataDate>${when}</xmp:MetadataDate>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
   <pdf:Producer>${xmlEsc(producer)}</pdf:Producer>
  </rdf:Description>${fx}
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

/**
 * The plugin.
 *
 *   attachment   { bytes, fileName, description, documentType: 'INVOICE', conformance }
 *                or null for a PDF/A-3 with nothing embedded
 *
 * Objects, in order: XMP metadata, the ICC stream, the output intent, then — when there is an
 * attachment — the embedded file stream and its file specification.
 */
export function pdfaPlugin({ attachment = null } = {}) {
  const count = attachment ? 5 : 3;
  return {
    count,
    build(first, pdf) {
      pdf.pdfVersion = '1.7';
      pdf.fileId = pdf.fileId || fileIdFor(`${pdf.title}|${pdf.author}|${pdf.createdAt.toISOString()}`);
      const producer = 'Invoice Studio by ANUPRESS';
      const metaNum = first, iccNum = first + 1, intentNum = first + 2, fileNum = first + 3, specNum = first + 4;

      const xmp = utf8(xmpPacket({
        title: pdf.title, author: pdf.author, created: pdf.createdAt, producer,
        facturx: attachment ? { fileName: attachment.fileName, documentType: attachment.documentType || 'INVOICE', conformance: attachment.conformance || 'EN 16931' } : null,
      }));
      const icc = sRGBProfile();

      const objects = [
        { dict: '<< /Type /Metadata /Subtype /XML /Length %LEN% >>', stream: xmp },
        { dict: '<< /N 3 /Length %LEN% >>', stream: icc },
        { dict: `<< /Type /OutputIntent /S /GTS_PDFA1 /OutputConditionIdentifier (sRGB IEC61966-2.1) /Info (sRGB IEC61966-2.1) /RegistryName (http://www.color.org) /DestOutputProfile ${iccNum} 0 R >>` },
      ];
      let catalog = ` /Metadata ${metaNum} 0 R /OutputIntents [ ${intentNum} 0 R ]`;

      if (attachment) {
        const name = String(attachment.fileName).replace(/[\\()]/g, '\\$&');
        objects.push({
          dict: `<< /Type /EmbeddedFile /Subtype /text#2Fxml /Params << /ModDate (${pdfDate(pdf.createdAt)}) /Size ${attachment.bytes.length} >> /Length %LEN% >>`,
          stream: attachment.bytes,
        });
        objects.push({
          dict: `<< /Type /Filespec /F (${name}) /UF (${name}) /Desc (${String(attachment.description || 'Electronic invoice').replace(/[\\()]/g, '\\$&')}) /AFRelationship /Alternative /EF << /F ${fileNum} 0 R /UF ${fileNum} 0 R >> >>`,
        });
        catalog += ` /AF [ ${specNum} 0 R ] /Names << /EmbeddedFiles << /Names [ (${name}) ${specNum} 0 R ] >> >>`;
      }

      return { objects, catalog };
    },
  };
}
