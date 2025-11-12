const CACHE_NAME = 'reciclagem-pereque-v2';
const urlsToCache = [
  '/',
  '/manifest.json',
  '/icon-512.png',
  '/favicon.ico'
];

// Instalar service worker e cachear recursos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Cache opened');
        return cache.addAll(urlsToCache);
      })
  );
});

// Interceptar requisições e servir do cache quando offline
self.addEventListener('fetch', (event) => {
  // Verificar se a requisição é válida antes de processar
  if (!event.request || !event.request.url) {
    return;
  }
  
  let url;
  try {
    url = new URL(event.request.url);
  } catch (e) {
    // URL inválida, ignorar
    return;
  }
  
  // Ignorar requisições de schemes não suportados (chrome-extension, chrome, etc)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return; // Não processar requisições de extensões ou outros schemes
  }
  
  // Ignorar requisições de extensões do Chrome (verificação adicional)
  if (url.href.includes('chrome-extension://') || 
      url.href.includes('chrome://') ||
      url.href.includes('moz-extension://')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - retornar response do cache
        if (response) {
          return response;
        }

        return fetch(event.request).then(
          (response) => {
            // Verificar se recebemos uma response válida
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Não cachear requisições de API ou dados dinâmicos
            if (url.pathname.startsWith('/api/') || 
                url.pathname.includes('.db') ||
                url.pathname.includes('supabase')) {
              return response;
            }

            // Não cachear arquivos WASM - devem ser sempre buscados da rede
            if (url.pathname.endsWith('.wasm')) {
              return fetch(event.request);
            }

            // Verificar novamente se o protocolo é válido antes de fazer cache
            if (url.protocol !== 'http:' && url.protocol !== 'https:') {
              return response; // Retornar sem fazer cache
            }

            // IMPORTANTE: Clonar a response. Uma response é um stream
            // e pode ser consumida apenas uma vez.
            const responseToCache = response.clone();

            // Tentar fazer cache, mas ignorar erros (ex: chrome-extension)
            caches.open(CACHE_NAME)
              .then((cache) => {
                // Verificação final antes de fazer cache
                if (event.request.url && 
                    !event.request.url.includes('chrome-extension://') &&
                    !event.request.url.includes('chrome://') &&
                    !event.request.url.includes('moz-extension://')) {
                  cache.put(event.request, responseToCache).catch((err) => {
                    // Ignorar erros de cache silenciosamente
                    // Não logar para evitar poluir o console
                  });
                }
              })
              .catch((err) => {
                // Ignorar erros de abertura de cache silenciosamente
              });

            return response;
          }
        );
      })
      .catch(() => {
        // Se ambos (cache e network) falharem, mostrar página offline
        if (event.request.destination === 'document') {
          return caches.match('/');
        }
      })
  );
});

// Limpar caches antigos
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});