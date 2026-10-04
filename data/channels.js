// Curated catalogue of freely available TV channels (Latvian, Russian,
// Ukrainian and English).
//
// Every stream URL here is a public HLS (`.m3u8`) source taken from openly
// published channel lists. Availability of live TV streams can change or be
// geo-restricted, so the catalogue leads with live channels and keeps a
// public test stream ("Demo Kanāls") at the end as a last-resort fallback.
//
// Optional per-channel fields:
//   country   ISO-ish label + used to render a flag (LV/RU/UA/EN).
//   bouquet   set-top-style tab (LV1, LV2, RU1, RU2, UA1, EN1, EN2).
//   proxy     when true, the stream is played back through the server's HLS
//             proxy (`/proxy/:id`) so no-CORS / header-restricted / HTTP
//             upstreams still play in the browser. Any playable channel can
//             also be fetched via the proxy as a CORS fallback.
//   headers   upstream request headers ({ userAgent, referer }) for the proxy.
//   available when false, the channel is listed but has no playable live feed.

export function isPlayable(channel) {
  return Boolean(channel && channel.available !== false && channel.stream);
}

/** Initial playUrl goes through the proxy (CORS, mixed-content, extra headers). */
export function shouldProxy(channel) {
  if (!isPlayable(channel) || channel.local) return false;
  return true;
}

/** Remote catalogue streams may be fetched via /proxy/:id. */
export function isProxyable(channel) {
  return isPlayable(channel) && !channel.local;
}

export const channels = [
  {
    id: 'house-live',
    name: 'Latvijas.tv Live',
    tagline: 'Servera tiešraide — vienmēr pieejama',
    category: 'Tiešraide',
    language: 'Latviešu',
    country: 'LV',
    logo: '📡',
    color: '#22c55e',
    local: true,
    stream: '/live/index.m3u8',
    live: true,
    bouquet: 'LV1',
  },
  {
    id: 'ltv1',
    name: 'LTV1',
    tagline: 'Latvijas Televīzija 1',
    category: 'Vispārīgs',
    language: 'Latviešu',
    country: 'LV',
    logo: '1️⃣',
    color: '#d7263d',
    stream:
      'https://lsm.eu.cdns-redge.media/livehls/o2/lsm-live/live/ltv1_pasaule/live.livx/playlist.m3u8',
    live: true,
    bouquet: 'LV1',
  },
  {
    id: 'ltv7',
    name: 'LTV7',
    tagline: 'Latvijas Televīzija 7',
    category: 'Vispārīgs',
    language: 'Latviešu',
    country: 'LV',
    logo: '7️⃣',
    color: '#1d4ed8',
    stream:
      'https://lsm.eu.cdns-redge.media/livehls/o2/lsm-live/live/ltv7_pasaule/live.livx/playlist.m3u8',
    live: true,
    bouquet: 'LV1',
  },
  {
    id: 'retv',
    name: 'Re:TV',
    tagline: 'Latvijas reģionālā televīzija',
    category: 'Vispārīgs',
    language: 'Latviešu',
    country: 'LV',
    logo: '🟥',
    color: '#e11d48',
    stream:
      'https://retv2132.cloudycdn.services/slive/_definst_/retv_retv_channel_5k7_42787_default_891_hls.smil/playlist.m3u8',
    live: true,
    bouquet: 'LV1',
  },
  {
    id: 'tv3-life',
    name: 'TV3 Life',
    tagline: 'Izklaide un dzīvesstils',
    category: 'Izklaide',
    language: 'Latviešu',
    country: 'LV',
    logo: '3️⃣',
    color: '#f97316',
    stream: 'http://stream.mcquack.net/373/index.m3u8',
    live: true,
    bouquet: 'LV2',
  },
  {
    id: 'tv-jurmala',
    name: 'TV Jūrmala',
    tagline: 'Ziņas un izklaide no Jūrmalas',
    category: 'Vispārīgs',
    language: 'Latviešu',
    country: 'LV',
    logo: '🌊',
    color: '#0ea5e9',
    stream: 'https://air.star.lv/TV_Jurmala_multistream/index.m3u8',
    live: true,
    bouquet: 'LV2',
  },
  {
    id: 'tvnet',
    name: 'TVNET',
    tagline: 'Latvijas ziņu portāla tiešraide',
    category: 'Ziņas',
    language: 'Latviešu',
    country: 'LV',
    logo: '📰',
    color: '#f59e0b',
    stream: 'https://player.tvnet.lv/stream/amlst:61659/playlist.m3u8',
    live: true,
    bouquet: 'LV2',
  },
  {
    id: 'radio-swh',
    name: 'Radio SWH TV',
    tagline: 'Mūzikas kanāls no Radio SWH',
    category: 'Mūzika',
    language: 'Latviešu',
    country: 'LV',
    logo: '🎵',
    color: '#22c55e',
    stream: 'https://00ff00.latnet.media/edge/swh_tv.smil/playlist.m3u8',
    live: true,
    bouquet: 'LV2',
  },
  {
    id: 'vdtv',
    name: 'Vidusdaugavas TV',
    tagline: 'Reģionālās ziņas no Vidusdaugavas',
    category: 'Reģionāls',
    language: 'Latviešu',
    country: 'LV',
    logo: '🏞️',
    color: '#14b8a6',
    stream: 'https://straume.vdtv.lv/vdtv2/index.m3u8',
    live: true,
    bouquet: 'LV2',
  },

  // ─── Krievu / Russian ──────────────────────────────────────────────
  {
    id: 'mir-24',
    name: 'Мир 24',
    tagline: 'Ziņu kanāls MTRK Mir',
    category: 'Ziņas',
    language: 'Русский',
    country: 'RU',
    logo: '🌐',
    color: '#0ea5e9',
    stream: 'http://hls.mirtv.cdnvideo.ru/mirtv-parampublish/mir24_2500/playlist.m3u8',
    live: true,
    bouquet: 'RU1',
  },
  {
    id: 'rbc',
    name: 'РБК',
    tagline: 'Biznesa un finanšu ziņas',
    category: 'Ziņas',
    language: 'Русский',
    country: 'RU',
    logo: '📈',
    color: '#111827',
    stream: 'https://online-video.rbc.ru/online2/rbctv.m3u8',
    live: true,
    bouquet: 'RU1',
  },
  {
    id: 'ru-360',
    name: '360°',
    tagline: 'Reģionālās ziņas',
    category: 'Ziņas',
    language: 'Русский',
    country: 'RU',
    logo: '🔵',
    color: '#2563eb',
    stream:
      'https://cdn-evacoder-tv.facecast.io/evacoder_hls_hi/CkxfR1xNUAJwTgtXTBZTAJli/index.m3u8',
    live: true,
    bouquet: 'RU1',
  },
  {
    id: 'rtg',
    name: 'RTG TV',
    tagline: 'Russia Travel Guide',
    category: 'Ceļojumi',
    language: 'Русский',
    country: 'RU',
    logo: '🗺️',
    color: '#b45309',
    stream: 'http://stream.mcquack.net/164/index.m3u8',
    live: true,
    bouquet: 'RU1',
  },
  {
    id: 'tnt',
    name: 'ТНТ (TNT)',
    tagline: 'Krievu izklaides kanāls',
    category: 'Izklaide',
    language: 'Русский',
    country: 'RU',
    logo: '🅣',
    color: '#111827',
    proxy: true,
    stream: 'http://stream.mcquack.net/135/index.m3u8',
    live: true,
    bouquet: 'RU2',
  },
  {
    id: 'friday',
    name: 'Пятница! (Friday)',
    tagline: 'Izklaide un ceļojumu šovi',
    category: 'Izklaide',
    language: 'Русский',
    country: 'RU',
    logo: '🔥',
    color: '#dc2626',
    proxy: true,
    stream: 'http://stream.mcquack.net/181/index.m3u8',
    live: true,
    bouquet: 'RU2',
  },
  {
    id: 'yu',
    name: 'Ю (Yu)',
    tagline: 'Krievu izklaides un realitātes šovi',
    category: 'Izklaide',
    language: 'Русский',
    country: 'RU',
    logo: '💗',
    color: '#db2777',
    // rutube stream has no CORS headers, so play it through the server proxy.
    proxy: true,
    stream:
      'https://bl.rutube.ru/livestream/5c9327074e25ca86f3111d4085cbbb65/index.m3u8?e=2066519758&s=9cPc1rCGu6M932eqrifRhQ&scheme=https',
    live: true,
    bouquet: 'RU2',
  },
  {
    id: 'ru-2x2',
    name: '2x2',
    tagline: 'Animācija un izklaide pieaugušajiem',
    category: 'Izklaide',
    language: 'Русский',
    country: 'RU',
    logo: '2️⃣',
    color: '#e11d48',
    proxy: true,
    stream:
      'https://bl.rutube.ru/livestream/392b4686b770bae2da6bf5ac4574add5/index.m3u8?e=2068731801&s=tenr-yHXUv1wibfka78s2A&scheme=https',
    live: true,
    bouquet: 'RU2',
  },
  {
    id: 'dom2',
    name: 'Дом-2',
    tagline: 'Tiešraidi bloķējis tiesību īpašnieks — pieejami tikai ieraksti',
    category: 'Realitātes šovs',
    language: 'Русский',
    country: 'RU',
    logo: '🏠',
    color: '#f472b6',
    stream: null,
    live: false,
    available: false,
    bouquet: 'RU2',
  },

  // ─── Ukraiņu / Ukrainian ───────────────────────────────────────────
  {
    id: 'ua-24',
    name: '24 Канал',
    tagline: 'Ukrainas ziņu kanāls',
    category: 'Ziņas',
    language: 'Українська',
    country: 'UA',
    logo: '📡',
    color: '#2563eb',
    proxy: true,
    stream:
      'https://streamvideol1.luxnet.ua/news24/smil:news24.stream.smil/playlist.m3u8',
    live: true,
    bouquet: 'UA1',
  },
  {
    id: 'ua-1plus1',
    name: '1+1 Марафон',
    tagline: 'Ukrainas vienoto ziņu maratons',
    category: 'Vispārīgs',
    language: 'Українська',
    country: 'UA',
    logo: '➕',
    color: '#e11d48',
    proxy: true,
    stream: 'https://dash2.antik.sk/live/1plus1_marathon/playlist.m3u8',
    live: true,
    bouquet: 'UA1',
  },

  // ─── Angļu / English ───────────────────────────────────────────────
  {
    id: 'france24-en',
    name: 'France 24 English',
    tagline: 'International news in English',
    category: 'Ziņas',
    language: 'English',
    country: 'EN',
    logo: '🇫🇷',
    color: '#1d4ed8',
    // Official public HLS media playlist. The older static.france24.com master
    // pointed at dead HTTP Akamai variants (400). Replaces a dead MTV ingest.
    proxy: true,
    stream: 'https://live.france24.com/hls/live/2037218-b/F24_EN_HI_HLS/master_5000.m3u8',
    live: true,
    bouquet: 'EN1',
  },
  {
    id: 'aljazeera-en',
    name: 'Al Jazeera English',
    tagline: 'International news in English',
    category: 'Ziņas',
    language: 'English',
    country: 'EN',
    logo: '🌍',
    color: '#b45309',
    // Upstream playlists/segments omit CORS headers.
    proxy: true,
    stream: 'https://live-hls-apps-aje-fa.getaj.net/AJE/index.m3u8',
    live: true,
    bouquet: 'EN1',
  },
  {
    id: 'dw-en',
    name: 'DW English',
    tagline: 'Deutsche Welle — international news',
    category: 'Ziņas',
    language: 'English',
    country: 'EN',
    logo: '🇩🇪',
    color: '#1d4ed8',
    // Official public HLS. Replaces ABC News Live, whose Akamai variants now 404.
    stream: 'https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/master.m3u8',
    live: true,
    bouquet: 'EN1',
  },
  {
    id: 'cgtn-en',
    name: 'CGTN English',
    tagline: 'China Global Television Network',
    category: 'Ziņas',
    language: 'English',
    country: 'EN',
    logo: '🌏',
    color: '#b91c1c',
    stream: 'https://english-livebkali.cgtn.com/live/encgtn.m3u8',
    live: true,
    bouquet: 'EN2',
  },
  {
    id: 'bloomberg',
    name: 'Bloomberg TV',
    tagline: 'Business and financial news',
    category: 'Ziņas',
    language: 'English',
    country: 'EN',
    logo: '⬛',
    color: '#111827',
    headers: { referer: 'https://www.bloomberg.com/' },
    stream: 'https://www.bloomberg.com/media-manifest/streams/us.m3u8',
    live: true,
    bouquet: 'EN2',
  },
  {
    id: 'arirang',
    name: 'Arirang TV',
    tagline: 'Korea International Broadcasting',
    category: 'Ziņas',
    language: 'English',
    country: 'EN',
    logo: '🇰🇷',
    color: '#1d4ed8',
    stream:
      'https://amdlive-ch01-ctnd-com.akamaized.net/arirang_1ch/smil:arirang_1ch.smil/playlist.m3u8',
    live: true,
    bouquet: 'EN2',
  },
  {
    id: 'demo',
    name: 'Demo Kanāls',
    tagline: 'Rezerves straumējums, ja tiešraide nav pieejama',
    category: 'Demo',
    language: 'Latviešu',
    country: 'LV',
    logo: '📺',
    color: '#8b5cf6',
    stream: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    live: false,
    bouquet: 'LV2',
  },
];

// Country label → flag emoji, used by the frontend.
export const countryFlags = {
  LV: '🇱🇻',
  RU: '🇷🇺',
  UA: '🇺🇦',
  EN: '🇬🇧',
};

// Set-top-style bouquet tabs (LV #1 / RU #2 / EN #1), matching the
// latvijas.tv grid the catalogue is modelled on.
export const bouquets = [
  { key: 'LV1', country: 'LV', label: 'LV #1' },
  { key: 'LV2', country: 'LV', label: 'LV #2' },
  { key: 'RU1', country: 'RU', label: 'RU #1' },
  { key: 'RU2', country: 'RU', label: 'RU #2' },
  { key: 'UA1', country: 'UA', label: 'UA #1' },
  { key: 'EN1', country: 'EN', label: 'EN #1' },
  { key: 'EN2', country: 'EN', label: 'EN #2' },
];

export function findChannel(id) {
  return channels.find((channel) => channel.id === id);
}
