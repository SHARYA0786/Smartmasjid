// features/namazTracker.js
window.NamazTrackerFeature = function({ currentMasjid, darkMode, onBack, t12, safeStorageGet, safeStorageSet, showToast }) {
  const [dailyRecords, setDailyRecords] = React.useState(() => {
    try { return JSON.parse(safeStorageGet('mc_daily_namaz_logs') || '{}'); } catch { return {}; }
  });
  const todayIso = new Date().toISOString().slice(0, 10);
  const [selDate, setSelDate] = React.useState(todayIso);

  const PRAYERS = [
    { id: 'fajr', name: 'Fajr', hindi: 'फ़ज्र', icon: '🌅', def: '05:15 AM' },
    { id: 'zuhr', name: 'Zuhr', hindi: 'ज़ुहर', icon: '☀️', def: '12:35 PM' },
    { id: 'asr', name: 'Asr', hindi: 'अस्र', icon: '🌤️', def: '04:20 PM' },
    { id: 'maghrib', name: 'Maghrib', hindi: 'मगरिब', icon: '🌇', def: '06:00 PM' },
    { id: 'isha', name: 'Isha', hindi: 'ईशा', icon: '🌙', def: '07:30 PM' }
  ];

  const togglePrayer = (key) => {
    setDailyRecords(prev => {
      const day = prev[selDate] || {};
      const nextDay = { ...day, [key]: !day[key] };
      const nextAll = { ...prev, [selDate]: nextDay };
      safeStorageSet('mc_daily_namaz_logs', JSON.stringify(nextAll));
      showToast(nextDay[key] ? `✅ ${key.toUpperCase()} अदा मार्क हुई` : `⚪ ${key.toUpperCase()} बाक़ी मार्क हुई`);
      return nextAll;
    });
  };

  const activeDay = dailyRecords[selDate] || {};
  const adaCount = PRAYERS.filter(p => activeDay[p.id]).length;

  return (
    <main className="px-3.5 py-3 space-y-3 flex-1 z-0 pb-24">
      <div className="bg-[#07382c] text-white p-3 rounded-2xl flex items-center justify-between">
        <button onClick={onBack} className="px-2.5 py-1 rounded-lg bg-white/15 text-xs font-bold">← More</button>
        <h2 className="font-extrabold text-sm">⏱️ डेली नमाज़ ट्रैकर</h2>
        <span className="text-xs font-mono font-bold bg-emerald-600 px-2 py-0.5 rounded-full">{adaCount}/5 अदा</span>
      </div>

      <div className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} p-3 rounded-2xl border flex items-center justify-between text-xs font-bold`}>
        <span>📅 तारीख़ चुनें:</span>
        <input type="date" value={selDate} max={todayIso} onChange={(e) => setSelDate(e.target.value)} className="p-1.5 rounded-xl border dark:bg-slate-700 font-mono" />
      </div>

      <div className="space-y-2">
        {PRAYERS.map(p => {
          const isAda = !!activeDay[p.id];
          const timeStr = (currentMasjid?.schedule?.[p.id]) ? t12(p.id, currentMasjid.schedule[p.id], p.def) : p.def;
          return (
            <div key={p.id} className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} p-3 rounded-2xl border flex items-center justify-between`}>
              <div className="flex items-center gap-2.5">
                <span className="text-xl">{p.icon}</span>
                <div>
                  <h4 className="font-extrabold text-xs">{p.name} ({p.hindi})</h4>
                  <span className="text-[10px] font-mono text-slate-400">{timeStr}</span>
                </div>
              </div>
              <button onClick={() => togglePrayer(p.id)} className={`px-4 py-1.5 rounded-full text-xs font-black transition ${isAda ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>
                {isAda ? '✓ Ada' : '⚪ Baqi'}
              </button>
            </div>
          );
        })}
      </div>
    </main>
  );
};