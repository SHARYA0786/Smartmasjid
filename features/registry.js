// features/registry.js
window.APP_FEATURES = [
  {
    id: 'tasbih',
    title: 'तस्बीह',
    sub: '33 · 33 · 34 की गिनती',
    bg: 'bg-[#eaf5ed] border-[#bfe0c9]',
    badge: 'bg-[#07382c] text-amber-400',
    icon: '📿',
    render: (props) => <window.TasbihFeature {...props} />
  },
  {
    id: 'qaza',
    title: 'नमाज़ ट्रैकर',
    sub: 'डेली रिकॉर्ड, रिपोर्ट व कैलेंडर',
    bg: 'bg-[#eaf5ed] border-[#bfe0c9]',
    badge: 'bg-[#07382c] text-amber-400',
    icon: '⏱️',
    render: (props) => <window.NamazTrackerFeature {...props} />
  },
  {
    id: 'ramzan',
    title: 'Ramadan Calendar',
    sub: 'Sehri & Iftar Timetable',
    bg: 'bg-[#fff6be] border-[#f0dd8a]',
    badge: 'bg-[#7a5200] text-amber-100',
    icon: '🌙',
    render: (props) => <window.RamzanFeature {...props} />
  },
  {
    id: 'qibla',
    title: 'क़िब्ला कंपास',
    sub: 'नमाज़ की दिशा',
    bg: 'bg-[#e6f1fa] border-[#bcd6ea]',
    badge: 'bg-[#1e4f7a] text-sky-50',
    icon: '🧭',
    render: (props) => <window.QiblaFeature {...props} />
  }
];