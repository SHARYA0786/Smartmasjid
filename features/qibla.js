// features/qibla.js
const KAABA = { lat: 21.4225, lng: 39.8262 };

const qiblaBearing = (lat, lng) => {
  const r = Math.PI / 180;
  const p1 = lat * r, p2 = KAABA.lat * r, dl = (KAABA.lng - lng) * r;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) / r + 360) % 360;
};

const kaabaDistanceKm = (lat, lng) => {
  const r = Math.PI / 180;
  const dLat = (KAABA.lat - lat) * r, dLng = (KAABA.lng - lng) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * r) * Math.cos(KAABA.lat * r) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

window.QiblaFeature = function({ userLocation, hasGps, onGps, darkMode, onBack }) {
  const [heading, setHeading] = React.useState(null);
  const [active, setActive] = React.useState(false);
  const [msg, setMsg] = React.useState('');

  const lat = userLocation ? userLocation.lat : 28.6139;
  const lng = userLocation ? userLocation.lng : 77.2090;
  const bearing = hasGps ? qiblaBearing(lat, lng) : null;

  React.useEffect(() => {
    if (!active) return;
    const handler = (ev) => {
      let h = null;
      if (typeof ev.webkitCompassHeading === 'number') h = ev.webkitCompassHeading;
      else if (ev.absolute && typeof ev.alpha === 'number') h = (360 - ev.alpha) % 360;
      if (h !== null) setHeading(h);
    };
    window.addEventListener('deviceorientationabsolute', handler, true);
    window.addEventListener('deviceorientation', handler, true);
    return () => {
      window.removeEventListener('deviceorientationabsolute', handler, true);
      window.removeEventListener('deviceorientation', handler, true);
    };
  }, [active]);

  const start = async () => {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted') { setMsg('सेंसर की इजाज़त नहीं मिली।'); return; }
      }
      setActive(true); setMsg('');
    } catch (e) { setMsg('इस फोन में कंपास सेंसर उपलब्ध नहीं है।'); }
  };

  const diff = bearing !== null && heading !== null ? ((bearing - heading + 540) % 360) - 180 : null;
  const aligned = diff !== null && Math.abs(diff) < 5;
  const arrowRot = bearing !== null ? (heading !== null ? bearing - heading : bearing) : 0;
  const northRot = heading !== null ? -heading : 0;

  return (
    <main className="px-3.5 py-3 space-y-3 flex-1 z-0 pb-24">
      <button onClick={onBack} className="flex items-center gap-1 text-xs font-bold text-emerald-700 min-h-[40px]">← More</button>
      <h2 className="font-masjid text-2xl text-[#07382c] dark:text-emerald-300">🧭 क़िब्ला कंपास</h2>
      <div className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} p-4 rounded-2xl border flex flex-col items-center gap-3`}>
        <svg width="260" height="260" viewBox="0 0 260 260">
          <circle cx="130" cy="130" r="120" fill="none" stroke="#9bb8a6" strokeWidth="3" />
          <circle cx="130" cy="130" r="104" fill="none" stroke="#c9dccf" strokeWidth="1" />
          <g transform={`rotate(${northRot} 130 130)`}>
            <text x="130" y="30" textAnchor="middle" fontSize="16" fontWeight="700" fill="#b91c1c">N</text>
            <text x="130" y="244" textAnchor="middle" fontSize="13" fill="#6b7a72">S</text>
            <text x="238" y="135" textAnchor="middle" fontSize="13" fill="#6b7a72">E</text>
            <text x="22" y="135" textAnchor="middle" fontSize="13" fill="#6b7a72">W</text>
          </g>
          {bearing !== null && (
            <g transform={`rotate(${arrowRot} 130 130)`}>
              <polygon points="130,48 146,130 114,130" fill={aligned ? '#16a34a' : '#07382c'} />
              <polygon points="114,130 146,130 130,190" fill="#cbd5d0" />
              <circle cx="130" cy="130" r="8" fill="#eab308" />
              <text x="130" y="42" textAnchor="middle" fontSize="15">🕋</text>
            </g>
          )}
        </svg>
        {bearing === null ? (
          <button onClick={onGps} className="px-4 py-2.5 bg-[#07382c] text-white rounded-xl text-sm font-bold">📍 अपनी लोकेशन लगाएं</button>
        ) : (
          <div className="text-center space-y-1">
            <div className="text-sm font-bold">क़िब्ला: उत्तर से {Math.round(bearing)}°</div>
            <div className="text-[11px] text-slate-500">काबा यहाँ से लगभग {Math.round(kaabaDistanceKm(lat, lng)).toLocaleString('en-IN')} km</div>
            {aligned && <div className="text-emerald-600 font-extrabold text-sm">✅ आप क़िब्ले की तरफ़ हैं</div>}
          </div>
        )}
        {!active ? (
          <button onClick={start} className="px-5 py-2.5 bg-amber-400 text-slate-900 rounded-xl text-sm font-extrabold">🧭 कंपास चालू करें</button>
        ) : (
          <p className="text-[11px] text-slate-500 text-center">हरा तीर क़िब्ले की तरफ़ है।</p>
        )}
        {msg && <p className="text-[11px] text-rose-600 text-center">{msg}</p>}
      </div>
    </main>
  );
};