// home-nearby.js
// Home Tab & Nearby Tab UI (Separated from core.js)

window.HomeTabFeature = function HomeTabFeature({
  currentMasjid,
  landingRoleChoice,
  masjids,
  masjidsWithin10Km,
  hasGps,
  isInitialSyncing,
  isFetchingGps,
  darkMode,
  currentTime,
  liveAzanOn,
  allCombinedNotifications,
  smartRamadan,
  setShowRegisterModal,
  handleSelectMuqtadiRole,
  setCurrentTab,
  handleFetchGpsLocation,
  showToast,
  toggleFavorite,
  openMasjidInfo,
  toggleLiveAzanPref,
  shareMasjidWhatsApp,
  isBlueTickActive,
  getAutoCalculatedHijriDate,
  T,
  VerifiedBadge,
  FavButton,
  InfoButton,
  RouteButton,
  NamazProgressBar
}) {
  const hijriDisplay = (smartRamadan && smartRamadan.isMoonConfirmed && smartRamadan.isRamadanActive)
    ? `${String(smartRamadan.rozaDayNumber).padStart(2, '0')} Ramadan ${smartRamadan.hijriYear}`
    : getAutoCalculatedHijriDate(currentMasjid, currentTime);

  return (
    <main className="px-3 py-1.5 space-y-1.5 flex-1 z-0">
      {!currentMasjid ? (
        landingRoleChoice !== 'muqtadi' ? (
          <div className="py-2 space-y-3.5">
            <div className="text-center px-1">
              <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase">अस्सलाम अलैकुम</span>
              <h2 className="text-base sm:text-lg font-black mt-0.5">आप क्या हैं?</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setShowRegisterModal(true)} className="p-3.5 rounded-3xl border-2 text-center flex flex-col items-center justify-between gap-2 shadow-md bg-white dark:bg-slate-800 border-emerald-600 min-h-[145px]">
                <span className="text-3xl">👳</span>
                <div><span className="font-black text-xs block">1. क्या आप इमाम हैं?</span></div>
                <span className="w-full py-1.5 bg-[#07382c] text-white rounded-xl font-bold text-[11px]">➕ रजिस्टर करें</span>
              </button>
              <button onClick={handleSelectMuqtadiRole} className="p-3.5 rounded-3xl border-2 text-center flex flex-col items-center justify-between gap-2 shadow-md min-h-[145px] bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700">
                <span className="text-3xl">🕌</span>
                <div><span className="font-black text-xs block">2. मैं मुक़्तदी हूँ</span></div>
                <span className="w-full py-1.5 bg-amber-500 text-slate-950 rounded-xl font-black text-[11px]">📍 मस्जिदें देखें</span>
              </button>
            </div>
            <div className="text-center pt-0.5">
              <button onClick={() => setCurrentTab('profile')} className="text-xs text-emerald-800 dark:text-emerald-400 font-bold hover:underline py-1 px-3 rounded-full bg-emerald-50 dark:bg-slate-800 border border-emerald-200 dark:border-slate-700">🔑 इमाम लॉगिन करें</button>
            </div>
          </div>
        ) : (
          <div className="py-2 space-y-3 animate-in fade-in duration-300">
            <div className={`p-3.5 rounded-3xl border shadow-sm ${darkMode ? 'bg-slate-800/90 border-slate-700' : 'bg-white border-slate-200'}`}>
              <div className="flex justify-between items-center pb-2 mb-2 border-b dark:border-slate-700">
                <span className="text-xs font-black">📍 10 KM के दायरे की मस्जिदें</span>
                {hasGps && (
                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 dark:bg-emerald-900/50 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                    {masjidsWithin10Km.length} उपलब्ध
                  </span>
                )}
              </div>
              {isInitialSyncing && Object.keys(masjids).length === 0 ? (
                <div className="py-8 text-center space-y-2.5">
                  <div className="w-8 h-8 mx-auto border-3 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-300">मस्जिदें लोड हो रही हैं...</p>
                </div>
              ) : !hasGps ? (
                <div className="py-6 px-3 text-center space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center text-2xl shadow-inner">
                    📍
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-black text-sm text-slate-800 dark:text-white">📍 GPS / लोकेशन चालू करें</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto leading-relaxed">
                      आपके 10 KM के दायरे की मस्जिदें देखने के लिए फोन की लोकेशन (GPS) चालू करें।
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleFetchGpsLocation(false)}
                    disabled={isFetchingGps}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#0c4033] to-[#07382c] text-white rounded-xl font-bold text-xs shadow-md active:scale-95 transition-all"
                  >
                    {isFetchingGps ? <span className="animate-spin text-sm">⏳</span> : <span>🔄</span>}
                    {isFetchingGps ? 'लोकेशन खोजी जा रही है...' : 'GPS लोकेशन चालू करें'}
                  </button>
                </div>
              ) : masjidsWithin10Km.length === 0 ? (
                <div className="py-6 px-3 text-center space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-full bg-emerald-50 dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-2xl shadow-inner">
                    🕌
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-black text-sm text-slate-800 dark:text-white">10 KM के दायरे में कोई मस्जिद नहीं मिली</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto leading-relaxed">
                      आपके 10 KM के दायरे में अभी कोई मस्जिद रजिस्टर नहीं है। अपने इलाके की मस्जिद के इमाम साहब को यह ऐप शेयर करके रजिस्टर करवाएं!
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleFetchGpsLocation(false)}
                      disabled={isFetchingGps}
                      className="px-3 py-1.5 bg-emerald-100 dark:bg-slate-700 text-emerald-800 dark:text-emerald-300 rounded-xl font-bold text-xs active:scale-95 transition"
                    >
                      🔄 GPS रिफ्रेश
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (navigator.share) {
                          navigator.share({ title: 'Masjid Connect', text: 'अपनी मस्जिद को ऑनलाइन कनेक्ट करने के लिए Masjid Connect ऐप इस्तेमाल करें: ', url: window.location.href }).catch(() => {});
                        } else {
                          navigator.clipboard.writeText(window.location.href);
                          showToast('📋 लिंक कॉपी हो गया!');
                        }
                      }}
                      className="px-3 py-1.5 bg-[#07382c] text-white rounded-xl font-bold text-xs active:scale-95 transition"
                    >
                      📤 शेयर करें
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {masjidsWithin10Km.map((m) => (
                    <div key={m.id} onClick={() => toggleFavorite(m.id)} className={`p-2.5 rounded-2xl border cursor-pointer flex items-center gap-2.5 ${darkMode ? 'bg-slate-700/60 border-slate-600' : 'bg-[#eaf5ed] border-emerald-200'}`}>
                      <img src={m.photo || 'https://images.unsplash.com/photo-1542816417-0983c9c9ad53?auto=format&fit=crop&w=800&q=80'} alt={m.name} className="w-[96px] h-[96px] rounded-full object-cover border-2 border-emerald-600/40 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="font-black text-[15px] leading-tight break-words">{m.name}</h4>
                          {isBlueTickActive(m) && <VerifiedBadge size="sm" />}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-snug break-words">📍 {m.address}</p>
                        {m.distanceText && (
                          <span className="inline-block mt-1 text-[10px] font-mono font-bold text-emerald-800 bg-emerald-100 px-1.5 rounded">📍 {m.distanceText}</span>
                        )}
                      </div>
                      <div className="flex flex-col gap-[3px] shrink-0" onClick={(e) => e.stopPropagation()}>
                        <FavButton isFav={m.isFav} onClick={() => toggleFavorite(m.id)} />
                        <InfoButton onClick={() => openMasjidInfo(m.id, 'home')} />
                        <RouteButton m={m} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="text-center pt-1">
              <button onClick={() => setCurrentTab('profile')} className="text-[11px] text-slate-500 hover:text-emerald-700">👳 क्या आप इमाम हैं? प्रोफाइल टैब में लॉगिन करें →</button>
            </div>
          </div>
        )
      ) : (
        <>
          {/* COMBINED DATE & 1 DYNAMIC RAMAZAN COUNTDOWN LINE */}
          <div className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} rounded-2xl py-1.5 px-3 border shadow-xs`}>
            <div className="grid grid-cols-2 divide-x divide-slate-200 dark:divide-slate-700">
              {/* Left Column: English Date */}
              <div className="pr-2 flex items-center gap-1.5">
                <span className="text-xs">📅</span>
                <div className="min-w-0">
                  <span className="text-[9.5px] text-slate-500 dark:text-slate-400 font-medium block leading-none">English Date</span>
                  <strong className="text-[11.5px] font-bold block leading-tight mt-0.5 truncate text-slate-900 dark:text-slate-100">
                    {currentTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: '2-digit', year: 'numeric' })}
                  </strong>
                </div>
              </div>

              {/* Right Column: Hijri Date */}
              <div className="pl-2 flex items-center gap-1.5">
                <span className="text-xs">🕌</span>
                <div className="min-w-0">
                  <span className="text-[9.5px] text-slate-500 dark:text-slate-400 font-medium block leading-none">Hijri Date</span>
                  <strong className="text-[11.5px] font-bold font-urdu block leading-tight mt-0.5 truncate text-emerald-800 dark:text-emerald-400">
                    {hijriDisplay}
                  </strong>
                </div>
              </div>
            </div>

            {/* 1 Dynamic Live Line: Days until Ramzan OR Live Iftar / Sehri Countdown */}
            {smartRamadan && (
              <button
                type="button"
                onClick={() => setCurrentTab('ramzan')}
                className={`w-full mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-700/70 flex items-center justify-between gap-2 text-left active:opacity-80 transition ${
                  smartRamadan.isMoonConfirmed && smartRamadan.isRamadanActive
                    ? (smartRamadan.countdownTargetType === 'iftar'
                        ? 'text-amber-700 dark:text-amber-300'
                        : 'text-sky-700 dark:text-sky-300')
                    : 'text-emerald-800 dark:text-emerald-300'
                }`}
              >
                <span className="text-[11px] font-extrabold truncate flex items-center gap-1 min-w-0">
                  <span>{smartRamadan.homeLineIcon}</span>
                  <span className="truncate">{smartRamadan.homeLineText}</span>
                </span>
                <span className={`text-[10px] font-mono font-black px-1.5 py-0.5 rounded-md shrink-0 ${
                  smartRamadan.isMoonConfirmed && smartRamadan.isRamadanActive
                    ? (smartRamadan.countdownTargetType === 'iftar'
                        ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200'
                        : 'bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-200')
                    : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 border border-emerald-200/60 dark:border-emerald-800/50'
                }`}>
                  {smartRamadan.homeRightBadge} →
                </span>
              </button>
            )}
          </div>

          {/* NAMAZ PROGRESS BAR */}
          <NamazProgressBar schedule={currentMasjid.schedule} currentTime={currentTime} darkMode={darkMode} />

          {/* NAMAZ KE AWAQAT (with Dedicated KHATM-E-SEHRI Card) */}
          <div className="bg-[#0c4033] text-white rounded-2xl p-2.5 shadow-md relative mt-1.5">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-xs tracking-wide">Namaz Ke Awaqat</h3>
              <button onClick={toggleLiveAzanPref} aria-pressed={liveAzanOn} className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border flex items-center gap-1 ${liveAzanOn ? 'bg-rose-500 border-rose-300 text-white' : 'bg-white/10 border-white/30 text-white/80'}`}>
                {liveAzanOn ? '🔔' : '🔕'} लाइव अज़ान: {liveAzanOn ? 'ON' : 'OFF'}
              </button>
            </div>

            <div className="grid grid-cols-5 gap-1.5 text-center">
              <div className="bg-[#c8f0d8] text-slate-900 rounded-xl p-1.5 flex flex-col items-center">
                <span className="text-xs sm:text-sm font-black text-slate-900 tracking-wide uppercase">FAJR</span>
                <div className="my-0.5 text-emerald-700 text-lg">🌅</div>
                <span className="text-[9.5px] text-slate-600 font-bold leading-none uppercase">AZAN</span>
                <strong className="text-xs sm:text-[13.5px] font-mono font-bold my-0.5 leading-tight">{T(currentMasjid.schedule, 'fajr', '05:20')}</strong>
                <span className="text-[9.5px] text-slate-600 font-bold mt-0.5 leading-none uppercase">JAMAT</span>
                <strong className="text-xs sm:text-[13.5px] font-mono font-black text-emerald-950 leading-tight">{T(currentMasjid.schedule, 'fajrJamat', '05:45')}</strong>
              </div>
              <div className="bg-[#fff6be] text-slate-900 rounded-xl p-1.5 flex flex-col items-center">
                <span className="text-xs sm:text-sm font-black text-slate-900 tracking-wide uppercase">ZUHR</span>
                <div className="my-0.5 text-amber-600 text-lg">☀️</div>
                <span className="text-[9.5px] text-slate-600 font-bold leading-none uppercase">AZAN</span>
                <strong className="text-xs sm:text-[13.5px] font-mono font-bold my-0.5 leading-tight">{T(currentMasjid.schedule, 'zuhr', '12:35')}</strong>
                <span className="text-[9.5px] text-slate-600 font-bold mt-0.5 leading-none uppercase">JAMAT</span>
                <strong className="text-xs sm:text-[13.5px] font-mono font-black text-amber-950 leading-tight">{T(currentMasjid.schedule, 'zuhrJamat', '01:00')}</strong>
              </div>
              <div className="bg-[#fedfc7] text-slate-900 rounded-xl p-1.5 flex flex-col items-center">
                <span className="text-xs sm:text-sm font-black text-slate-900 tracking-wide uppercase">ASR</span>
                <div className="my-0.5 text-orange-600 text-lg">🌤️</div>
                <span className="text-[9.5px] text-slate-600 font-bold leading-none uppercase">AZAN</span>
                <strong className="text-xs sm:text-[13.5px] font-mono font-bold my-0.5 leading-tight">{T(currentMasjid.schedule, 'asr', '04:20')}</strong>
                <span className="text-[9.5px] text-slate-600 font-bold mt-0.5 leading-none uppercase">JAMAT</span>
                <strong className="text-xs sm:text-[13.5px] font-mono font-black text-orange-950 leading-tight">{T(currentMasjid.schedule, 'asrJamat', '04:45')}</strong>
              </div>
              <div className="bg-[#ffd7dc] text-slate-900 rounded-xl p-1.5 flex flex-col items-center">
                <span className="text-xs sm:text-sm font-black text-slate-900 tracking-wide uppercase">MAGHRIB</span>
                <div className="my-0.5 text-rose-600 text-lg">🌇</div>
                <span className="text-[9.5px] text-slate-600 font-bold leading-none uppercase">AZAN</span>
                <strong className="text-xs sm:text-[13.5px] font-mono font-bold my-0.5 leading-tight">{T(currentMasjid.schedule, 'maghrib', '05:50')}</strong>
                <span className="text-[9.5px] text-slate-600 font-bold mt-0.5 leading-none uppercase">JAMAT</span>
                <strong className="text-xs sm:text-[13.5px] font-mono font-black text-rose-950 leading-tight">{T(currentMasjid.schedule, 'maghribJamat', '06:10')}</strong>
              </div>
              <div className="bg-[#d2edfd] text-slate-900 rounded-xl p-1.5 flex flex-col items-center">
                <span className="text-xs sm:text-sm font-black text-slate-900 tracking-wide uppercase">ISHA</span>
                <div className="my-0.5 text-sky-700 text-lg">🌙</div>
                <span className="text-[9.5px] text-slate-600 font-bold leading-none uppercase">AZAN</span>
                <strong className="text-xs sm:text-[13.5px] font-mono font-bold my-0.5 leading-tight">{T(currentMasjid.schedule, 'isha', '07:15')}</strong>
                <span className="text-[9.5px] text-slate-600 font-bold mt-0.5 leading-none uppercase">JAMAT</span>
                <strong className="text-xs sm:text-[13.5px] font-mono font-black text-sky-950 leading-tight">{T(currentMasjid.schedule, 'ishaJamat', '07:45')}</strong>
              </div>
            </div>

            {/* 4 Special Timing Cards: KHATM SEHRI, TULU AFTAB, ZAWAL, JUMA */}
            <div className="grid grid-cols-4 gap-1.5 mt-2 text-center">
              <div className="bg-[#e0e7ff] text-slate-900 rounded-xl p-1.5 flex flex-col items-center justify-between shadow-xs border border-indigo-200/80">
                <span className="text-[10px] sm:text-[11px] font-black text-indigo-950 leading-tight uppercase tracking-tight">KHATM SEHRI</span>
                <div className="text-indigo-600 text-base my-0.5">✨</div>
                <strong className="text-[11.5px] sm:text-xs font-mono font-black text-indigo-950 leading-tight">{T(currentMasjid.schedule, 'khatmSehri', smartRamadan ? smartRamadan.baseSehri24 : '04:45')}</strong>
              </div>
              <div className="bg-[#fff3c4] text-slate-900 rounded-xl p-1.5 flex flex-col items-center justify-between shadow-xs">
                <span className="text-[10px] sm:text-[11px] font-black text-amber-950 leading-tight uppercase tracking-tight">TULU AFTAB</span>
                <div className="text-amber-500 text-base my-0.5">🌄</div>
                <strong className="text-[11.5px] sm:text-xs font-mono font-black leading-tight">{T(currentMasjid.schedule, 'sunrise', '06:40')}</strong>
              </div>
              <div className="bg-[#ffe4cc] text-slate-900 rounded-xl p-1.5 flex flex-col items-center justify-between shadow-xs">
                <span className="text-[10px] sm:text-[11px] font-black text-orange-950 leading-tight uppercase tracking-tight">ZAWAL</span>
                <div className="text-orange-500 text-base my-0.5">☀️</div>
                <strong className="text-[11.5px] sm:text-xs font-mono font-black leading-tight">{T(currentMasjid.schedule, 'sunset', '12:15')}</strong>
              </div>
              <div className="bg-[#bbf7d0] text-slate-900 rounded-xl p-1.5 flex flex-col items-center justify-between border border-emerald-300 shadow-xs">
                <span className="text-[10px] sm:text-[11px] font-black text-emerald-950 leading-tight uppercase tracking-tight">JUMA</span>
                <div className="flex flex-col w-full gap-0.5 mt-0.5">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[8px] text-slate-600 font-bold uppercase">AZAN</span>
                    <strong className="text-[10.5px] sm:text-[11px] font-mono font-bold leading-none">{T(currentMasjid.schedule, 'jumaAzan', '01:00')}</strong>
                  </div>
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[8px] text-slate-600 font-bold uppercase">JMT</span>
                    <strong className="text-[10.5px] sm:text-[11px] font-mono font-black text-emerald-950 leading-none">{T(currentMasjid.schedule, 'jumaJamat', '01:30')}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* WHATSAPP SHARE BUTTON */}
            <button
              type="button"
              onClick={() => shareMasjidWhatsApp(currentMasjid)}
              className="w-full mt-2 py-2 bg-[#25D366] hover:bg-[#20ba59] active:scale-95 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition"
            >
              <span className="text-sm">📲</span>
              <span>नमाज़ के औक़ात WhatsApp पर शेयर करें</span>
            </button>
          </div>

          <div className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-[#eaf5ed] border-emerald-100'} rounded-2xl p-3 border mt-3`}>
            <h4 className="font-extrabold text-[#07382c] dark:text-emerald-400 text-xs mb-1">Aaj ki Hadees</h4>
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-emerald-700 text-white flex justify-center items-center">📖</div>
              <div className="flex-1">
                <p className="text-xs leading-relaxed font-medium">{currentMasjid.dailyHadith || '“Ilm hasil karna har Musalman mard aur aurat par farz hai.”'}</p>
                <span className="text-[10px] text-slate-500 block mt-0.5">{currentMasjid.dailyHadithRef || '— (Ibn Majah)'}</span>
              </div>
            </div>
          </div>

          {/* ताज़ा ऐलान: मस्जिद व एडमिन दोनों के ऐलान शामिल */}
          {allCombinedNotifications.length > 0 && (
            <div id="taza-aelan-section" className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} rounded-2xl p-3 border mt-3 scroll-mt-20`}>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-extrabold text-[#07382c] dark:text-emerald-400 text-xs flex items-center gap-1.5">
                  <span>📢</span>
                  <span>ताज़ा ऐलान</span>
                </h4>
                <span className="text-[10px] font-bold text-slate-400">
                  {allCombinedNotifications.length} ऐलान
                </span>
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
                {allCombinedNotifications.map(n => (
                  <div key={n.id} className={`p-2.5 rounded-xl border transition ${n.isAdmin ? (darkMode ? 'bg-amber-950/40 border-amber-700/70' : 'bg-amber-50/90 border-amber-300') : (darkMode ? 'bg-slate-700/60 border-slate-600' : 'bg-emerald-50/80 border-emerald-200')}`}>
                    <div className="flex items-center justify-between gap-1.5 flex-wrap mb-1">
                      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md flex items-center gap-1 shadow-2xs ${n.isAdmin ? 'bg-amber-500 text-slate-950' : 'bg-[#07382c] text-white'}`}>
                        {n.isAdmin ? '👑 मस्जिद कनेक्ट एडमिन' : `🕌 ${n.senderName || currentMasjid?.name || 'मस्जिद'}`}
                      </span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono font-bold">🕒 {n.date}</span>
                    </div>
                    <strong className="text-xs font-bold block text-slate-900 dark:text-white">{n.title}</strong>
                    <p className="text-[11px] leading-relaxed mt-0.5 font-urdu text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{n.message || n.body}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
};

window.NearbyTabFeature = function NearbyTabFeature({
  currentMasjid,
  masjids,
  masjidsWithin10Km,
  allMasjidsWithDist,
  hasGps,
  isInitialSyncing,
  isFetchingGps,
  darkMode,
  setSelectedMasjidId,
  setCurrentTab,
  safeStorageSet,
  handleFetchGpsLocation,
  showToast,
  toggleFavorite,
  openMasjidInfo,
  isBlueTickActive,
  VerifiedBadge,
  FavButton,
  InfoButton,
  RouteButton
}) {
  return (
    <main className="px-3.5 py-3 space-y-3 flex-1 z-0 pb-24">
      <div className="flex justify-between items-center">
        <h3 className="font-extrabold text-sm">📍 10 KM के दायरे की मस्जिदें</h3>
        {hasGps && (
          <span className="text-[11px] font-mono font-bold text-emerald-700 bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 px-2 py-0.5 rounded-full">
            {masjidsWithin10Km.length} उपलब्ध
          </span>
        )}
      </div>

      {isInitialSyncing && Object.keys(masjids).length === 0 ? (
        <div className="py-12 text-center space-y-2.5">
          <div className="w-8 h-8 mx-auto border-3 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-bold text-slate-600 dark:text-slate-300">मस्जिदें लोड हो रही हैं...</p>
        </div>
      ) : !hasGps ? (
        <div className={`p-6 text-center space-y-3 rounded-2xl border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200 shadow-xs'}`}>
          <div className="w-12 h-12 mx-auto rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center text-2xl shadow-inner">
            📍
          </div>
          <div className="space-y-1">
            <h4 className="font-black text-sm text-slate-800 dark:text-white">📍 GPS / लोकेशन चालू करें</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto leading-relaxed">
              आपके 10 KM के दायरे की मस्जिदें देखने के लिए कृपया फोन की लोकेशन (GPS) चालू करें।
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleFetchGpsLocation(false)}
            disabled={isFetchingGps}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#0c4033] to-[#07382c] text-white rounded-xl font-bold text-xs shadow-md active:scale-95 transition-all"
          >
            {isFetchingGps ? <span className="animate-spin text-sm">⏳</span> : <span>🔄</span>}
            {isFetchingGps ? 'लोकेशन खोजी जा रही है...' : 'GPS लोकेशन चालू करें'}
          </button>
        </div>
      ) : masjidsWithin10Km.length === 0 ? (
        <div className={`p-6 text-center space-y-3 rounded-2xl border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200 shadow-xs'}`}>
          <div className="w-12 h-12 mx-auto rounded-full bg-emerald-50 dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-2xl shadow-inner">
            🕌
          </div>
          <div className="space-y-1">
            <h4 className="font-black text-sm text-slate-800 dark:text-white">10 KM के दायरे में कोई मस्जिद नहीं मिली</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto leading-relaxed">
              आपके 10 KM के दायरे में अभी कोई मस्जिद रजिस्टर नहीं है। अपने इलाके की मस्जिद के इमाम साहब को यह ऐप शेयर करके रजिस्टर करवाएं!
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => handleFetchGpsLocation(false)}
              disabled={isFetchingGps}
              className="px-3 py-1.5 bg-emerald-100 dark:bg-slate-700 text-emerald-800 dark:text-emerald-300 rounded-xl font-bold text-xs active:scale-95 transition"
            >
              🔄 GPS रिफ्रेश
            </button>
            <button
              type="button"
              onClick={() => {
                if (navigator.share) {
                  navigator.share({ title: 'Masjid Connect', text: 'अपनी मस्जिद को ऑनलाइन कनेक्ट करने के लिए Masjid Connect ऐप इस्तेमाल करें: ', url: window.location.href }).catch(() => {});
                } else {
                  navigator.clipboard.writeText(window.location.href);
                  showToast('📋 लिंक कॉपी हो गया!');
                }
              }}
              className="px-3 py-1.5 bg-[#07382c] text-white rounded-xl font-bold text-xs active:scale-95 transition"
            >
              📤 शेयर करें
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {masjidsWithin10Km.map((m) => (
            <div key={m.id} onClick={() => { setSelectedMasjidId(m.id); safeStorageSet('mc_selected_masjid_id', m.id); setCurrentTab('home'); }} className={`p-2.5 rounded-2xl border cursor-pointer flex items-center gap-2.5 ${currentMasjid && currentMasjid.id === m.id ? 'border-emerald-600 bg-emerald-50/50 dark:bg-slate-800' : darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200/80'}`}>
              <img src={m.photo || 'https://images.unsplash.com/photo-1542816417-0983c9c9ad53?auto=format&fit=crop&w=800&q=80'} alt={m.name} className="w-[96px] h-[96px] rounded-full object-cover border-2 border-emerald-600/40 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h4 className="font-black text-[15px] leading-tight break-words">{m.name}</h4>
                  {isBlueTickActive(m) && <VerifiedBadge size="sm" />}
                </div>
                <p className="text-[11px] text-slate-500 leading-snug break-words mt-0.5">{m.address}</p>
                {m.distanceText ? (
                  <span className="inline-block mt-1 text-[10px] font-mono font-bold text-emerald-800 bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 px-1.5 rounded">📍 {m.distanceText}</span>
                ) : (
                  <span className="inline-block mt-1 text-[9.5px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/40 px-1.5 rounded">📍 लोकेशन दर्ज नहीं</span>
                )}
              </div>
              <div className="flex flex-col gap-[3px] shrink-0" onClick={(e) => e.stopPropagation()}>
                <FavButton isFav={m.isFav} onClick={() => toggleFavorite(m.id)} />
                <InfoButton onClick={() => openMasjidInfo(m.id, 'nearby')} />
                <RouteButton m={m} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* अन्य सभी मस्जिदें (10 KM से बाहर या जिनकी लोकेशन Imam ने दर्ज नहीं की) */}
      {allMasjidsWithDist.length > masjidsWithin10Km.length && (
        <div className="pt-3 border-t dark:border-slate-700 space-y-2">
          <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
            अन्य सभी मस्जिदें ({allMasjidsWithDist.length - masjidsWithin10Km.length})
          </div>
          <div className="space-y-2">
            {allMasjidsWithDist.filter(m => !masjidsWithin10Km.some(w => w.id === m.id)).map((m) => (
              <div key={m.id} onClick={() => { setSelectedMasjidId(m.id); safeStorageSet('mc_selected_masjid_id', m.id); setCurrentTab('home'); }} className={`p-2.5 rounded-2xl border cursor-pointer flex items-center gap-2.5 ${darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-50/90 border-slate-200'}`}>
                <img src={m.photo || 'https://images.unsplash.com/photo-1542816417-0983c9c9ad53?auto=format&fit=crop&w=800&q=80'} alt={m.name} className="w-[80px] h-[80px] rounded-full object-cover border-2 border-emerald-600/30 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h4 className="font-black text-sm leading-tight break-words">{m.name}</h4>
                    {isBlueTickActive(m) && <VerifiedBadge size="sm" />}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug break-words mt-0.5">{m.address}</p>
                  {m.hasValidLocation && m.distanceText ? (
                    <span className="inline-block mt-1 text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300 bg-slate-200 dark:bg-slate-700 px-1.5 rounded">📍 {m.distanceText}</span>
                  ) : (
                    <span className="inline-block mt-1 text-[9.5px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/40 px-1.5 rounded">📍 लोकेशन दर्ज नहीं</span>
                  )}
                </div>
                <div className="flex flex-col gap-[3px] shrink-0" onClick={(e) => e.stopPropagation()}>
                  <FavButton isFav={m.isFav} onClick={() => toggleFavorite(m.id)} />
                  <InfoButton onClick={() => openMasjidInfo(m.id, 'nearby')} />
                  {m.hasValidLocation && <RouteButton m={m} />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
};
