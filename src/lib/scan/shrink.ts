// The scanner's photo shrink, shared by the scan page (components/scan/CardScanner.tsx) and the pull
// tracker's "Scan a hit" button (components/PullTracker.tsx): longest side 1,024 px, JPEG at 0.82, as a
// data: URL. Browser only. The photo never leaves the browser except as the one /api/scan/identify call.
const MAX_SIDE = 1024;

export async function shrinkPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions).catch(() => null);
  let w: number, h: number, src: CanvasImageSource;
  if (bitmap) {
    w = bitmap.width; h = bitmap.height; src = bitmap;
  } else {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await img.decode();
    w = img.naturalWidth; h = img.naturalHeight; src = img;
  }
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(h * k);
  canvas.getContext("2d")!.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}
