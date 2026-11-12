// features/ramzan.js
window.RamzanFeature = function({ currentMasjid, currentTime, darkMode, onBack, t12, normSchedule, build30DaysTimetable, isBlueTickActive, VerifiedBadge }) {
  const m = currentMasjid;
  const sch = normSchedule(m && m.schedule);
  const rz = (m && m.ramzan) || {};
  const today0 = new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate());
  const todayIso = `${today0.getFullYear()}-${String(today0.getMonth() + 1).padStart(2, '0')}-${String(today0.getDate()).padStart(2, '0')}`;

  const baseStart = rz.startDate || todayIso;
  const defaultSehri = rz.sehri || sch.fajr || '04:45';
  const defaultIftar = rz.iftar || sch.maghrib || '18:15';
  const calendarDays = (Array.isArray(rz.days) && rz.days.length === 30)
    ? rz.days
    : build30DaysTimetable(baseStart, defaultSehri, defaultIftar);

  const todayRow = calendarDays.find(d => d.date === todayIso);
  const todaySehri = (todayRow && todayRow.sehri) || defaultSehri;
  const todayIftar = (todayRow && todayRow.iftar) || defaultIftar;

  const card = `${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} p-3 rounded-2xl border shadow-xs`;
  const fmtDate = (dStr) => {
    try { return new Date(dStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
    catch { return dStr; }
  };

  return (
    <main className="px-3 py-2.5 space-y-2 flex-1 z-0 pb-20">
      <button onClick={onBack} className="flex items-center gap-1 text-xs font-bold text-emerald-700 min-h-[36px]">← Back to More</button>
      <div className={`${card} space-y-2`}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-masjid text-xl text-[#07382c] dark:text-emerald-300 font-bold uppercase">RAMAZAN CALENDAR 2026</h2>
            <div className="text-xs font-semibold text-slate-500">Local Standard Time</div>
          </div>
          {m && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 max-w-[150px] truncate inline-flex items-center gap-1">
              <span className="truncate">{m.name}</span>
              {isBlueTickActive(m) && <VerifiedBadge size="xs" />}
            </span>
          )}
        </div>
        <div className="py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-50 to-amber-50 dark:from-slate-700 dark:to-slate-800 border border-emerald-200 flex items-center justify-around text-xs font-bold">
          <div>🌙 Sehri: <span className="font-mono font-black text-sky-800 dark:text-sky-300">{t12('sehri', todaySehri)}</span></div>
          <span>|</span>
          <div>🌇 Iftar: <span className="font-mono font-black text-amber-700 dark:text-amber-400">{t12('iftar', todayIftar)}</span></div>
        </div>
      </div>

      <div className={`${card} !p-0 overflow-hidden`}>
        <div className="grid grid-cols-[38px_1.1fr_1fr_1fr] text-[10.5px] font-black uppercase bg-[#07382c] text-white px-2.5 py-1.5">
          <span>Day</span><span>Date</span><span>Sehri</span><span>Iftar</span>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {calendarDays.map((item, idx) => {
            const isToday = item.date === todayIso;
            return (
              <div key={idx} className={`grid grid-cols-[38px_1.1fr_1fr_1fr] text-[11px] px-2.5 py-1 items-center ${isToday ? 'bg-amber-100/90 dark:bg-amber-950/70 font-bold' : ''}`}>
                <span className="font-bold">#{item.day}</span>
                <span>{fmtDate(item.date)} {isToday && <span className="text-[8px] px-1 rounded bg-amber-500 text-slate-950">Today</span>}</span>
                <span className="font-mono font-bold text-sky-800 dark:text-sky-300">{t12('sehri', item.sehri)}</span>
                <span className="font-mono font-bold text-amber-700 dark:text-amber-400">{t12('iftar', item.iftar)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
};