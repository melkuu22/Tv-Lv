// Curated catalogue of freely available Latvian TV channels.
//
// Every stream URL here is a public HLS (`.m3u8`) source taken from openly
// published channel lists. Availability of live TV streams can change or be
// geo-restricted, so the catalogue always leads with a rock-solid public test
// stream ("Demo Kanāls") that is guaranteed to play. This keeps the app
// demonstrably functional even when an upstream broadcaster is offline.

export const channels = [
  {
    id: 'demo',
    name: 'Demo Kanāls',
    tagline: 'Vienmēr pieejams demonstrācijas straumējums',
    category: 'Demo',
    language: 'Latviešu',
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
    logo: '🏞️',
    color: '#14b8a6',
    stream: 'https://straume.vdtv.lv/vdtv2/index.m3u8',
    live: true,
  },
];

export function findChannel(id) {
  return channels.find((channel) => channel.id === id);
}
