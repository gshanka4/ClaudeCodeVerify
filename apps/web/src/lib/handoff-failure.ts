/** UX-D: VSIX download path (served by Vite public dir or CDN in prod). */
export const EXTENSION_VSIX_PATH = "/architectai.vsix";

export function extensionVsixUrl(): string {
  const base = import.meta.env.VITE_VSIX_URL as string | undefined;
  return base ?? EXTENSION_VSIX_PATH;
}
