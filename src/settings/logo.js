// Turning a chosen file into the two data URIs a business's logo is stored as.
//
// Two copies, because two things display it and they can accept different formats:
//
//   logoData  what the screen and the email show. PNG while it stays small, so a transparent logo
//             stays transparent on paper of any colour.
//   logoJpeg  what the PDF embeds. DCTDecode is the one image filter our PDF writer can emit
//             without a compression library, so the PDF copy is always a JPEG, flattened onto
//             white — the paper it is going to sit on.
//
// Scaled to display size rather than print resolution, and the cap in sanitise() is a hard limit
// this has to land under: the whole thing is stored as text inside settings, which travel in a
// Grist document in one product and in a browser's own storage in the other.
//
// Shared by the widget's settings panel and the web version's form. It lives here rather than in
// either of them because a second copy would be a second set of size limits to disagree with the
// first, and the one that disagreed would be the one producing a logo too big to save.

const MAX_W = 560;
const MAX_H = 200;
const PNG_LIMIT = 120000;   // past this a transparent PNG costs more than transparency is worth

export function readLogo(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const scale = Math.min(1, MAX_W / img.naturalWidth, MAX_H / img.naturalHeight);
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));

        const draw = (flatten) => {
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const cx = canvas.getContext('2d');
          if (flatten) { cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, w, h); }
          cx.drawImage(img, 0, 0, w, h);
          return canvas;
        };

        const png = draw(false).toDataURL('image/png');
        const jpeg = draw(true).toDataURL('image/jpeg', 0.87);
        resolve({ logoData: png.length <= PNG_LIMIT ? png : jpeg, logoJpeg: jpeg, logoLight: isLight(draw(false)) });
      } catch (e) { reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('not an image')); };
    img.src = url;
  });
}

/**
 * Is this artwork light — drawn for a dark ground?
 *
 * The mean luminance of the pixels that are actually painted (alpha above a quarter). A white or
 * pale mark on a transparent ground is what a business with a navy letterhead uploads, and the
 * one thing it must not get is a white plate behind it. Sampled on a stride so a 560×200 canvas
 * costs nothing noticeable; a canvas that cannot be read (tainted) counts as dark, the safe default.
 */
function isLight(canvas) {
  try {
    const cx = canvas.getContext('2d');
    const { data } = cx.getImageData(0, 0, canvas.width, canvas.height);
    let sum = 0, n = 0;
    for (let i = 0; i < data.length; i += 16) {
      if (data[i + 3] < 64) continue;
      sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      n++;
    }
    return n > 0 && sum / n > 150;
  } catch { return false; }
}

/**
 * The logo flattened onto a colour, as a JPEG data URI — for the PDF, which can embed only JPEG.
 *
 * The stored logoJpeg is flattened onto white, which is right for a mark drawn for paper. A light
 * mark with the plate turned off would vanish into the white sheet, so the PDF gets it flattened
 * onto the accent instead, which is the band it sits on everywhere else.
 */
export function flattenLogo(dataUri, hex) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        const cx = canvas.getContext('2d');
        cx.fillStyle = hex || '#14509b';
        cx.fillRect(0, 0, canvas.width, canvas.height);
        const pad = Math.round(Math.min(canvas.width, canvas.height) * 0.08);
        cx.drawImage(img, pad, pad, canvas.width - 2 * pad, canvas.height - 2 * pad);
        resolve(canvas.toDataURL('image/jpeg', 0.87));
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = dataUri;
  });
}
