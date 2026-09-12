// Curated catalogue of freely available TV channels (Latvian, Russian,
// Ukrainian and English).
//
// Every stream URL here is a public HLS (`.m3u8`) source taken from openly
// published channel lists. Availability of live TV streams can change or be
// geo-restricted, so the catalogue always leads with a rock-solid public test
// stream ("Demo Kanāls") that is guaranteed to play. This keeps the app
// demonstrably functional even when an upstream broadcaster is offline.
//
// Optional per-channel fields:
//   country   ISO-ish label + used to render a flag (LV/RU/UA/EN).
//   proxy     when true, the stream is played back through the server's HLS
//             proxy (`/proxy/:id`) so no-CORS / header-restricted upstreams
//             still play in the browser.
//   headers   upstream request headers ({ userAgent, referer }) for the proxy.
//   available when false, the channel is listed but has no playable live feed.

export const channels = [
  {
    id: 'demo',
    name: 'Demo Kanāls',
    tagline: 'Vienmēr pieejams demonstrācijas straumējums',
    category: 'Demo',
    language: 'Latviešu',
    country: 'LV',
    logo: '📺',
    color: '#8b5cf6',
    stream: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    live: false,
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
  },

  // ─── Krievu / Russian ──────────────────────────────────────────────
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
  },

  // ─── Angļu / English ───────────────────────────────────────────────
  {
    id: 'mtv',
    name: 'MTV',
    tagline: 'Music Television',
    category: 'Mūzika',
    language: 'English',
    country: 'EN',
    logo: '🎸',
    color: '#7c3aed',
    // HTTP-only upstream — play through the proxy so HTTPS pages are not mixed-content blocked.
    proxy: true,
    stream: 'http://dvr2.kablova.tv/MTV/index.m3u8',
    live: true,
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
  },
];

// Country label → flag emoji, used by the frontend.
export const countryFlags = {
  LV: '🇱🇻',
  RU: '🇷🇺',
  UA: '🇺🇦',
  EN: '🇬🇧',
};

export function findChannel(id) {
  return channels.find((channel) => channel.id === id);
}
