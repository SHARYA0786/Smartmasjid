// features/ramzan.js
// Beautiful Multi-Year Ramadan Calendar with Imam Moon Confirmation & Live Sehri/Iftar Countdown

window.RamzanFeature = function RamzanFeature({
  currentMasjid,
  currentTime,
  darkMode,
  onBack,
  t12,
  isBlueTickActive,
  VerifiedBadge,
  smartRamadan,
  loggedImamMasjidId,
  onOpenRamzanEdit
}) {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const formatDateNice = (isoStr) => {
    if (!isoStr || typeof isoStr !== 'string' || !isoStr.includes('-')) return { main: '—', dayName: '' };
    const [y, m, d] = isoStr.split('-').map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    if (isNaN(dt.getTime())) return { main: isoStr, dayName: '' };
    return {
      main: `${String(dt.getDate()).padStart(2, '0')} ${MONTHS[dt.getMonth()]}`,
      dayName: WEEKDAYS[dt.getDay()]
    };
  };

  const formatFullDate = (isoStr) => {
    if (!isoStr || !isoStr.includes('-')) return '—';
    const [y, m, d] = isoStr.split('-').map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    if (isNaN(dt.getTime())) return isoStr;
    return `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
  };

  const sr = smartRamadan || {};
  const daysList = Array.isArray(sr.daysList) ? sr.daysList : [];
  const isConfirmed = !!sr.isMoonConfirmed;
  const isActive = !!sr.isRamadanActive;
  const isLoggedImam = !!(loggedImamMasjidId && currentMasjid && loggedImamMasjidId === currentMasjid.id);

  const curY = currentTime.getFullYear();
  const curM = String(currentTime.getMonth() + 1).padStart(2, '0');
  const curD = String(currentTime.getDate()).padStart(2, '0');
  const todayIso = `${curY}-${curM}-${curD}`;

  const ODD_NIGHTS = [21, 23, 25, 27, 29];

  return (
    <main className="px-3.5 py-3 space-y-3 flex-1 z-0 pb-24">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-400 min-h-[38px]"
        >
          ← More
        </button>
        {isLoggedImam && typeof onOpenRamzanEdit === 'function' && (
          <button
            type="button"
            onClick={onOpenRamzanEdit}
            className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-[11px] shadow-sm active:scale-95 transition flex items-center gap-1"
          >
            <span>🌙</span>
            <span>{isConfirmed ? 'चाँद / तारीख़ बदलें' : 'चाँद कन्फर्म करें'}</span>
          </button>
        )}
      </div>

      {/* HERO BANNER CARD */}
      <div className="bg-gradient-to-br from-[#07382c] via-[#0c4b3b] to-[#062920] text-white rounded-3xl p-4 shadow-lg border border-amber-400/30 relative overflow-hidden">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30">
              {isConfirmed ? '✅ चाँद कन्फर्म (पक्का कैलेंडर)' : 'ℹ️ संभावित कैलेंडर'}
            </span>
            <h2 className="font-masjid text-2xl text-amber-300 mt-1.5 leading-tight">
              रमज़ान कैलेंडर {sr.ramadanYear || currentTime.getFullYear()}
            </h2>
            <p className="text-[11px] text-emerald-100/90 font-semibold mt-0.5">
              {sr.hijriYear ? `${sr.hijriYear} हिजरी • ` : ''}
              {sr.startDateIso ? `शुरुआत: ${formatFullDate(sr.startDateIso)}` : ''}
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-400/15 border border-amber-300/30 flex items-center justify-center text-3xl shrink-0">
            🌙
          </div>
        </div>

        {/* Masjid Badge */}
        {currentMasjid && (
          <div className="mt-3 p-2.5 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-xs font-black text-white truncate">
                <span className="truncate">🕌 {currentMasjid.name}</span>
                {isBlueTickActive && isBlueTickActive(currentMasjid) && VerifiedBadge && <VerifiedBadge size="xs" />}
              </div>
              <div className="text-[10px] text-emerald-200 truncate">
                {currentMasjid.address}{currentMasjid.stateLocation ? `, ${currentMasjid.stateLocation}` : ''}
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="text-[9.5px] text-emerald-200 block leading-none">आज सहरी / इफ़्तार</span>
              <span className="text-[11px] font-mono font-black text-amber-300">
                {t12('sehri', sr.todaySehri24 || sr.baseSehri24 || '04:45')} · {t12('iftar', sr.todayIftar24 || sr.baseIftar24 || '17:50')}
              </span>
            </div>
          </div>
        )}

        {/* Live Status Strip inside Hero */}
        <div className={`mt-3 p-2.5 rounded-2xl border flex items-center justify-between gap-2 ${
          isConfirmed && isActive
            ? 'bg-amber-400 text-slate-950 border-amber-300'
            : 'bg-black/25 text-white border-white/15'
        }`}>
          {isConfirmed && isActive ? (
            <>
              <div className="min-w-0">
                <span className="text-[10px] font-black uppercase tracking-wide block opacity-80">
                  आज {sr.rozaDayNumber}वां रोज़ा ({sr.countdownTargetType === 'iftar' ? 'इफ़्तार का वक़्त' : 'सहरी का वक़्त'})
                </span>
                <strong className="text-xs sm:text-sm font-black truncate block">
                  {sr.homeLineIcon} {sr.homeLineText}
                </strong>
              </div>
              <span className="px-2.5 py-1 rounded-xl bg-[#07382c] text-amber-300 font-mono font-black text-xs shrink-0">
                {sr.homeRightBadge}
              </span>
            </>
          ) : isConfirmed && sr.daysUntilStart > 0 ? (
            <>
              <div className="min-w-0">
                <span className="text-[10px] font-black text-amber-300 block">चाँद कन्फर्म हो गया है</span>
                <strong className="text-xs font-extrabold block">पहला रोज़ा {formatFullDate(sr.startDateIso)} से शुरू</strong>
              </div>
              <span className="px-2.5 py-1 rounded-xl bg-amber-400 text-slate-950 font-black text-xs shrink-0">
                {sr.daysUntilStart} दिन बाक़ी
              </span>
            </>
          ) : (
            <>
              <div className="min-w-0">
                <span className="text-[10px] text-amber-200 font-bold block leading-snug">
                  इमाम साहब द्वारा चाँद कन्फर्म होने के बाद पक्की तारीख़ व समय अपने आप दिखेंगे
                </span>
              </div>
              <span className="px-2.5 py-1 rounded-xl bg-amber-400/20 border border-amber-300/40 text-amber-200 font-black text-[11px] shrink-0">
                {sr.daysUntilStart} दिन बाक़ी
              </span>
            </>
          )}
        </div>
      </div>

      {/* SMALL NOTICE BEFORE MOON CONFIRMATION */}
      {!isConfirmed && (
        <div className={`p-2.5 rounded-2xl border text-[11px] leading-relaxed flex items-start gap-2 ${
          darkMode ? 'bg-amber-950/30 border-amber-800/60 text-amber-200' : 'bg-amber-50 border-amber-200 text-amber-900'
        }`}>
          <span className="text-sm shrink-0">📌</span>
          <span>
            यह <b>संभावित (Estimated)</b> कैलेंडर है। रमज़ान का चाँद नज़र आते ही आपके इमाम साहब चाँद कन्फर्म करेंगे, जिसके बाद नीचे सही तारीख़ से 30 दिन का पक्का कैलेंडर दिखने लगेगा।
          </span>
        </div>
      )}

      {/* 30-DAY TIMETABLE CARD */}
      <div className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} rounded-3xl border shadow-sm overflow-hidden`}>
        <div className="grid grid-cols-[54px_1fr_82px_82px] text-[10.5px] font-black uppercase tracking-wider bg-[#07382c] text-amber-300 py-2.5 px-3">
          <span>रोज़ा</span>
          <span>तारीख़ व दिन</span>
          <span className="text-center">ख़त्म सहरी</span>
          <span className="text-right">इफ़्तार</span>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-700/70">
          {daysList.map((row) => {
            const isTodayRow = isConfirmed && row.date === todayIso;
            const isPastRow = isConfirmed && row.date < todayIso;
            const isOddNight = ODD_NIGHTS.includes(row.day);
            const is27 = row.day === 27;
            const dtNice = formatDateNice(row.date);

            return (
              <div
                key={row.day}
                className={`grid grid-cols-[54px_1fr_82px_82px] items-center py-2.5 px-3 text-xs transition ${
                  isTodayRow
                    ? (darkMode ? 'bg-emerald-900/45 ring-1 ring-inset ring-emerald-400/60' : 'bg-emerald-50 ring-1 ring-inset ring-emerald-400')
                    : is27
                      ? (darkMode ? 'bg-amber-950/25' : 'bg-amber-50/70')
                      : isOddNight
                        ? (darkMode ? 'bg-slate-700/30' : 'bg-amber-50/30')
                        : ''
                } ${isPastRow ? 'opacity-55' : ''}`}
              >
                <div className="flex items-center gap-1">
                  <span className={`w-7 h-7 rounded-xl font-mono font-black text-[11px] flex items-center justify-center ${
                    isTodayRow
                      ? 'bg-[#07382c] text-amber-300 shadow-xs'
                      : is27
                        ? 'bg-amber-400 text-slate-950'
                        : isOddNight
                          ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-900 dark:text-emerald-200'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                  }`}>
                    {row.day}
                  </span>
                </div>

                <div className="min-w-0 pr-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-[12px] text-slate-900 dark:text-slate-100">{dtNice.main}</span>
                    <span className="text-[10px] font-semibold text-slate-400">{dtNice.dayName}</span>
                    {isTodayRow && (
                      <span className="text-[9px] font-black px-1.5 py-0.2 rounded-full bg-emerald-600 text-white">आज</span>
                    )}
                  </div>
                  {is27 ? (
                    <span className="text-[9.5px] font-extrabold text-amber-700 dark:text-amber-300 block">✨ शब-ए-क़द्र (संभावित)</span>
                  ) : isOddNight ? (
                    <span className="text-[9.5px] font-bold text-emerald-700 dark:text-emerald-400 block">✨ ताक़ रात</span>
                  ) : null}
                </div>

                <div className="text-center font-mono font-extrabold text-[11.5px] text-indigo-800 dark:text-sky-300">
                  {t12('khatmSehri', row.sehri)}
                </div>

                <div className="text-right font-mono font-black text-[11.5px] text-amber-700 dark:text-amber-300">
                  {t12('iftar', row.iftar)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[10.5px] text-center text-slate-500 dark:text-slate-400 px-2 leading-relaxed">
        नोट: इस कैलेंडर में सहरी का समय मस्जिद के <b>ख़त्म-ए-सहरी</b> और इफ़्तार का समय <b>मग़रिब की अज़ान</b> से जुड़ा है। अपने मोहल्ले की जंत्री के अनुसार इमाम साहब इसे एडिट कर सकते हैं।
      </p>
    </main>
  );
};
