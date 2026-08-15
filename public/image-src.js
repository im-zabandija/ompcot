/**
 * Wire image shape → usable `src`.
 *
 * OMP manda las imágenes de tres formas: data URL completa y base64 crudo (las dos las
 * produce el composer local) y `blob:sha256:<hash>`, una referencia al blob store de OMP
 * que sólo la extensión puede leer — de ahí el endpoint `/api/blob/:hash`.
 */
import { appendAccessToken, resolveAccessToken } from "./access-control.js";

const BLOB_REF = /^blob:sha256:([a-f0-9]{64})$/;

export function resolveImageSrc(image, accessToken = resolveAccessToken()) {
  const data = image?.data || "";
  if (!data) return "";
  if (data.startsWith("data:")) return data;
  const ref = BLOB_REF.exec(data);
  if (!ref) return `data:${image.mimeType || "image/png"};base64,${data}`;
  const mime = image.mimeType || "";
  const url = `/api/blob/${ref[1]}${mime ? `?mime=${encodeURIComponent(mime)}` : ""}`;
  return appendAccessToken(url, accessToken);
}
