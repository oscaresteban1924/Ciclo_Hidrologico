// Descarga de un archivo de texto: usa la capacidad del visor de artefactos si existe; si no, una descarga normal.

export type DownloadResult = 'saved' | 'declined' | 'error';

export async function downloadText(filename: string, text: string, mime = 'application/json;charset=utf-8'): Promise<DownloadResult> {
  const host = (window as unknown as { claude?: { use?: (name: string) => Promise<unknown> } }).claude;
  if (host?.use) {
    try {
      const downloads = (await host.use('downloads')) as { save: (r: { filename: string; data: string }) => Promise<unknown> } | null;
      if (downloads) {
        await downloads.save({ filename, data: text });
        return 'saved';
      }
    } catch (e) {
      return (e as { code?: string })?.code === 'declined' ? 'declined' : 'error';
    }
  }
  try {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'saved';
  } catch {
    return 'error';
  }
}

/** Descarga de un archivo binario (por ejemplo un ZIP): la misma ruta que el texto. */
export async function downloadBytes(filename: string, bytes: Uint8Array, mime = 'application/zip'): Promise<DownloadResult> {
  const host = (window as unknown as { claude?: { use?: (name: string) => Promise<unknown> } }).claude;
  if (host?.use) {
    try {
      const downloads = (await host.use('downloads')) as { save: (r: { filename: string; data: ArrayBuffer }) => Promise<unknown> } | null;
      if (downloads) {
        await downloads.save({ filename, data: bytes.slice().buffer as ArrayBuffer });
        return 'saved';
      }
    } catch (e) {
      return (e as { code?: string })?.code === 'declined' ? 'declined' : 'error';
    }
  }
  try {
    const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    return 'saved';
  } catch {
    return 'error';
  }
}
