"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function TicketQR({ token, label = "Digital ticket QR", onReady }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let active = true;
    QRCode.toString(token, { type: "svg", errorCorrectionLevel: "M", margin: 4, width: 240 }).then((value) => { if (active) { setSvg(value); onReady?.(); } }).catch(() => { if (active) setSvg(""); });
    return () => { active = false; };
  }, [token, onReady]);
  // Only locally encoded QR geometry is rendered; no server-provided markup.
  return svg ? <div role="img" aria-label={label} className="mx-auto w-60 max-w-full bg-white" dangerouslySetInnerHTML={{ __html: svg }} /> : <p role="status" className="p-6 text-xs">Preparing QR… Use the booking reference if the QR is unavailable.</p>;
}
