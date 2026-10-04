import { triggerDirectSoftwareInstall } from './directSoftwareInstall';

export { triggerDirectSoftwareInstall };

export async function triggerDirectAppDownload(deferredPrompt?: any) {
  return triggerDirectSoftwareInstall(deferredPrompt);
}
