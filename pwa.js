(function () {
  'use strict';
  const installButton = document.querySelector('#installButton');
  let deferredInstall = null;

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js?v=9', { updateViaCache: 'none' }));
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstall = event;
    installButton.hidden = false;
  });

  installButton.addEventListener('click', async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
    installButton.hidden = true;
  });

  window.addEventListener('appinstalled', () => {
    deferredInstall = null;
    installButton.hidden = true;
  });
})();
