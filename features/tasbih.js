// features/tasbih.js
window.TasbihFeature = function({ onBack, darkMode, safeStorageGet, safeStorageSet, showToast }) {
  const ZIKR_LIST = [
    {
      id: 'fatima',
      name: 'तस्बीह-ए-फ़ातिमा',
      sub: '33 · 33 · 34 ऑटो मोड',
      isFatima: true,
      target: 100
    },
    {
      id: 'durood',
      name: 'दुरूद शरीफ़',
      arabic: 'اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ',
      hindi: 'अल्लाहुम्मा सल्लि अला मुहम्मद',
      target: 100
    },
    {
      id: 'istighfar',
      name: 'अस्तग़फ़ार',
      arabic: 'أَسْتَغْفِرُ اللَّهَ الْعَظِيمَ',
      hindi: 'अस्तग़फ़िरुल्लाहल अज़ीम',
      target: 100
    },
    {
      id: 'kalima',
      name: 'पहला कलमा (तय्यिबा)',
      arabic: 'لَا إِلٰهَ إِلَّا اللّٰهُ',
      hindi: 'ला इलाहा इल्लल्लाह',
      target: 100
    },
    {
      id: 'subhanbihamdi',
      name: 'सुब्हानल्लाहि व बिहम्दिही',
      arabic: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ',
      hindi: 'सुब्हानल्लाहि व बिहम्दिही',
      target: 100
    }
  ];

  // LocalStorage से सेव डेटा लोड करें
  const getSavedState = () => {
    try {
      const raw = safeStorageGet ? safeStorageGet('mc_modern_tasbih_v2') : localStorage.getItem('mc_modern_tasbih_v2');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  };

  const saved = getSavedState();
  const [selectedId, setSelectedId] = React.useState(saved.selectedId || 'fatima');
  const [count, setCount] = React.useState(saved.count || 0);
  const [fatimaStep, setFatimaStep] = React.useState(saved.fatimaStep || 1);
  const [laps, setLaps] = React.useState(saved.laps || 0);
  const [vibrateOn, setVibrateOn] = React.useState(saved.vibrateOn !== false);
  const [history, setHistory] = React.useState(saved.history || {}); // { "2026-11-12": 134 }
  const [activeView, setActiveView] = React.useState('counter'); // 'counter' | 'history'
  const [customTitle, setCustomTitle] = React.useState(saved.customTitle || 'या अल्लाहु या रहमानु');
  const [customTarget, setCustomTarget] = React.useState(saved.customTarget || 100);
  const [showCustomEdit, setShowCustomEdit] = React.useState(false);

  const getTodayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // हर बदलाव को सुरक्षित सेव करें
  const saveAll = (nextData) => {
    const payload = {
      selectedId,
      count,
      fatimaStep,
      laps,
      vibrateOn,
      history,
      customTitle,
      customTarget,
      ...nextData
    };
    const str = JSON.stringify(payload);
    if (safeStorageSet) safeStorageSet('mc_modern_tasbih_v2', str);
    else try { localStorage.setItem('mc_modern_tasbih_v2', str); } catch {}
  };

  const activeZikr = selectedId === 'custom'
    ? { id: 'custom', name: 'कस्टम ज़िक्र', arabic: customTitle, hindi: 'आपका चुना हुआ ज़िक्र', target: Number(customTarget) || 100 }
    : (ZIKR_LIST.find(z => z.id === selectedId) || ZIKR_LIST[0]);

  const handleSelectZikr = (id) => {
    setSelectedId(id);
    setCount(0);
    setFatimaStep(1);
    setLaps(0);
    saveAll({ selectedId: id, count: 0, fatimaStep: 1, laps: 0 });
  };

  const handleTap = () => {
    if (vibrateOn && navigator.vibrate) {
      try { navigator.vibrate(35); } catch {}
    }

    // आज की हिस्ट्री में +1 जोड़ें
    const today = getTodayIso();
    const nextHistory = { ...history, [today]: (history[today] || 0) + 1 };
    setHistory(nextHistory);

    if (activeZikr.isFatima) {
      if (fatimaStep === 1) {
        if (count + 1 >= 33) {
          setFatimaStep(2); setCount(0);
          saveAll({ fatimaStep: 2, count: 0, history: nextHistory });
        } else {
          setCount(count + 1);
          saveAll({ count: count + 1, history: nextHistory });
        }
      } else if (fatimaStep === 2) {
        if (count + 1 >= 33) {
          setFatimaStep(3); setCount(0);
          saveAll({ fatimaStep: 3, count: 0, history: nextHistory });
        } else {
          setCount(count + 1);
          saveAll({ count: count + 1, history: nextHistory });
        }
      } else {
        if (count + 1 >= 34) {
          if (vibrateOn && navigator.vibrate) navigator.vibrate([80, 50, 80]);
          setFatimaStep(1); setCount(0); setLaps(laps + 1);
          if (showToast) showToast('🎉 माशा अल्लाह! 1 पूरी तस्बीह (100) मुकम्मल हुई');
          saveAll({ fatimaStep: 1, count: 0, laps: laps + 1, history: nextHistory });
        } else {
          setCount(count + 1);
          saveAll({ count: count + 1, history: nextHistory });
        }
      }
    } else {
      const target = activeZikr.target || 100;
      if (count + 1 >= target) {
        if (vibrateOn && navigator.vibrate) navigator.vibrate([80, 50, 80]);
        setCount(0); setLaps(laps + 1);
        if (showToast) showToast(`🎉 माशा अल्लाह! ${target} की गिनती पूरी हुई`);
        saveAll({ count: 0, laps: laps + 1, history: nextHistory });
      } else {
        setCount(count + 1);
        saveAll({ count: count + 1, history: nextHistory });
      }
    }
  };

  const handleReset = () => {
    setCount(0);
    setFatimaStep(1);
    setLaps(0);
    saveAll({ count: 0, fatimaStep: 1, laps: 0 });
    if (showToast) showToast('🔄 काउंटर रीसेट हो गया', 'info');
  };

  // प्रोग्रेस रिंग कैलकुलेशन
  const currentStepTarget = activeZikr.isFatima ? (fatimaStep === 3 ? 34 : 33) : (activeZikr.target || 100);
  const progressPct = Math.min(100, Math.round((count / currentStepTarget) * 100));
  const radius = 78;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progressPct / 100) * circumference;

  // पिछले 7 दिनों का रिकॉर्ड (Weekly History)
  const getWeeklyStats = () => {
    const days = [];
    const now = new Date();
    let weekTotal = 0;
    let maxDayCount = 1;

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const val = history[iso] || 0;
      weekTotal += val;
      if (val > maxDayCount) maxDayCount = val;
      days.push({
        iso,
        dayShort: d.toLocaleDateString('en-US', { weekday: 'short' }),
        dateNum: d.getDate(),
        count: val,
        isToday: i === 0
      });
    }
    const allTimeTotal = Object.values(history).reduce((a, b) => a + (Number(b) || 0), 0);
    return { days, weekTotal, allTimeTotal, maxDayCount, todayCount: history[getTodayIso()] || 0 };
  };

  const stats = getWeeklyStats();

  // वर्तमान अरबी और हिंदी टेक्स्ट
  const displayArabic = activeZikr.isFatima
    ? (fatimaStep === 1 ? 'سُبْحَانَ اللَّهِ' : fatimaStep === 2 ? 'الْحَمْدُ لِلَّهِ' : 'اللَّهُ أَكْبَرُ')
    : activeZikr.arabic;

  const displayHindi = activeZikr.isFatima
    ? (fatimaStep === 1 ? 'सुब्हानल्लाह (33 बार)' : fatimaStep === 2 ? 'अल्हम्दुलिल्लाह (33 बार)' : 'अल्लाहु अकबर (34 बार)')
    : activeZikr.hindi;

  const cardClass = darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800';

  return (
    <main className="px-3.5 py-3 space-y-3 flex-1 z-0 pb-24">
      {/* TOP HEADER BAR */}
      <div className="bg-gradient-to-r from-[#0c4033] to-[#07382c] text-white p-3 rounded-2xl shadow-md flex items-center justify-between border border-emerald-700/60">
        <button onClick={onBack} className="px-2.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-bold active:scale-95 transition">
          ← More
        </button>
        <div className="text-center">
          <h2 className="font-masjid text-lg tracking-wide text-amber-300 leading-none">डिजिटल तस्बीह</h2>
          <span className="text-[10px] text-emerald-200">आज की गिनती: <b>{stats.todayCount}</b></span>
        </div>
        <button
          onClick={() => { const next = !vibrateOn; setVibrateOn(next); saveAll({ vibrateOn: next }); }}
          className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm border transition ${vibrateOn ? 'bg-emerald-500/30 border-emerald-300 text-white' : 'bg-white/10 border-white/20 text-white/50'}`}
          title="वाइब्रेशन चालू/बंद"
        >
          {vibrateOn ? '📳' : '🔇'}
        </button>
      </div>

      {/* SWITCHER TABS: TASBIH vs WEEKLY HISTORY */}
      <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-200/80 dark:bg-slate-800 rounded-2xl text-xs font-extrabold">
        <button
          onClick={() => setActiveView('counter')}
          className={`py-2 rounded-xl transition ${activeView === 'counter' ? 'bg-[#07382c] text-white shadow-xs' : 'text-slate-600 dark:text-slate-300'}`}
        >
          📿 तस्बीह पढ़ें
        </button>
        <button
          onClick={() => setActiveView('history')}
          className={`py-2 rounded-xl transition flex items-center justify-center gap-1.5 ${activeView === 'history' ? 'bg-[#07382c] text-white shadow-xs' : 'text-slate-600 dark:text-slate-300'}`}
        >
          <span>📊 हफ़्ते का रिकॉर्ड</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-400 text-slate-950 font-mono">{stats.weekTotal}</span>
        </button>
      </div>

      {/* ================= VIEW 1: MODERN TASBIH COUNTER ================= */}
      {activeView === 'counter' && (
        <div className="space-y-3 animate-in fade-in">
          {/* HORIZONTAL SCROLLABLE ZIKR SELECTOR */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {ZIKR_LIST.map(z => (
              <button
                key={z.id}
                onClick={() => handleSelectZikr(z.id)}
                className={`px-3 py-2 rounded-2xl text-xs font-bold shrink-0 border transition active:scale-95 ${
                  selectedId === z.id
                    ? 'bg-[#07382c] text-amber-300 border-emerald-600 shadow-sm'
                    : `${cardClass} hover:border-emerald-400`
                }`}
              >
                {z.name}
              </button>
            ))}
            <button
              onClick={() => { handleSelectZikr('custom'); setShowCustomEdit(true); }}
              className={`px-3 py-2 rounded-2xl text-xs font-bold shrink-0 border transition active:scale-95 ${
                selectedId === 'custom'
                  ? 'bg-[#07382c] text-amber-300 border-emerald-600 shadow-sm'
                  : `${cardClass} hover:border-emerald-400`
              }`}
            >
              ✏️ कस्टम ज़िक्र
            </button>
          </div>

          {/* CUSTOM ZIKR EDITOR BOX */}
          {selectedId === 'custom' && showCustomEdit && (
            <div className={`${cardClass} p-3 rounded-2xl border space-y-2 text-xs`}>
              <div className="flex justify-between items-center font-bold text-emerald-700 dark:text-emerald-300">
                <span>अपना ज़िक्र और टारगेट लिखें:</span>
                <button onClick={() => setShowCustomEdit(false)} className="text-slate-400">✕</button>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => { setCustomTitle(e.target.value); saveAll({ customTitle: e.target.value }); }}
                  placeholder="ज़िक्र लिखें..."
                  className="flex-1 p-2 rounded-xl border dark:bg-slate-700 dark:border-slate-600 font-bold"
                />
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={customTarget}
                  onChange={(e) => { setCustomTarget(e.target.value); saveAll({ customTarget: e.target.value }); }}
                  className="w-20 p-2 rounded-xl border dark:bg-slate-700 dark:border-slate-600 font-mono font-bold text-center"
                />
              </div>
            </div>
          )}

          {/* MAIN ARABIC DISPLAY CARD */}
          <div className={`${cardClass} p-4 rounded-3xl border shadow-xs text-center space-y-2 relative overflow-hidden`}>
            {activeZikr.isFatima && (
              <div className="flex justify-center gap-1.5 mb-1">
                {[1, 2, 3].map(step => (
                  <span
                    key={step}
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-black transition ${
                      fatimaStep === step
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-400'
                    }`}
                  >
                    {step === 1 ? '1. सुब्हानल्लाह (33)' : step === 2 ? '2. अल्हम्दुलिल्लाह (33)' : '3. अल्लाहु अकबर (34)'}
                  </span>
                ))}
              </div>
            )}

            <div className="font-arabic text-3xl sm:text-4xl text-[#07382c] dark:text-emerald-300 py-2 leading-relaxed font-bold">
              {displayArabic}
            </div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
              {displayHindi}
            </p>
          </div>

          {/* CIRCULAR PROGRESS & BIG 3D TAP BUTTON */}
          <div className="flex flex-col items-center justify-center py-2 relative">
            <div className="relative w-48 h-48 flex items-center justify-center">
              {/* SVG Circular Progress Ring */}
              <svg className="w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 180 180">
                <circle
                  cx="90"
                  cy="90"
                  r={radius}
                  stroke={darkMode ? '#1e293b' : '#d1fae5'}
                  strokeWidth="10"
                  fill="none"
                />
                <circle
                  cx="90"
                  cy="90"
                  r={radius}
                  stroke="#10b981"
                  strokeWidth="10"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="none"
                  className="transition-all duration-200 ease-out"
                />
              </svg>

              {/* Center Tactile Tap Button */}
              <button
                type="button"
                onClick={handleTap}
                className="absolute w-36 h-36 rounded-full bg-gradient-to-b from-[#0f5241] to-[#062c22] text-white flex flex-col items-center justify-center shadow-2xl border-4 border-amber-400/80 active:scale-92 transition-transform select-none cursor-pointer"
              >
                <span className="text-4xl sm:text-5xl font-mono font-black tracking-tight text-white drop-shadow">
                  {count}
                </span>
                <span className="text-[11px] font-mono font-bold text-amber-300 mt-0.5">
                  / {currentStepTarget}
                </span>
                <span className="text-[9.5px] uppercase tracking-widest text-emerald-200/80 mt-1 font-bold">
                  TAP
                </span>
              </button>
            </div>
          </div>

          {/* BOTTOM STATS & RESET BAR */}
          <div className={`${cardClass} p-3 rounded-2xl border flex items-center justify-between text-xs`}>
            <div className="flex items-center gap-3">
              <div>
                <span className="text-[10px] text-slate-400 block">मुकम्मल चक्कर</span>
                <strong className="text-sm font-mono font-black text-emerald-700 dark:text-emerald-400">{laps} Laps</strong>
              </div>
              <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />
              <div>
                <span className="text-[10px] text-slate-400 block">आज कुल पढ़ा</span>
                <strong className="text-sm font-mono font-black text-amber-600 dark:text-amber-400">{stats.todayCount}</strong>
              </div>
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-extrabold border border-rose-200 dark:border-rose-800/60 active:scale-95 transition"
            >
              🔄 रीसेट
            </button>
          </div>
        </div>
      )}

      {/* ================= VIEW 2: 7-DAY WEEKLY HISTORY ================= */}
      {activeView === 'history' && (
        <div className="space-y-3 animate-in fade-in">
          {/* SUMMARY CARDS */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className={`${cardClass} p-3 rounded-2xl border shadow-xs`}>
              <span className="text-[10px] text-slate-400 font-bold block">आज (Today)</span>
              <strong className="text-lg font-mono font-black text-emerald-700 dark:text-emerald-400">{stats.todayCount}</strong>
            </div>
            <div className={`${cardClass} p-3 rounded-2xl border shadow-xs bg-amber-50/50 dark:bg-amber-950/20 border-amber-300/70`}>
              <span className="text-[10px] text-amber-800 dark:text-amber-300 font-bold block">इस हफ़्ते (7 दिन)</span>
              <strong className="text-lg font-mono font-black text-amber-600 dark:text-amber-400">{stats.weekTotal}</strong>
            </div>
            <div className={`${cardClass} p-3 rounded-2xl border shadow-xs`}>
              <span className="text-[10px] text-slate-400 font-bold block">अब तक कुल</span>
              <strong className="text-lg font-mono font-black text-sky-700 dark:text-sky-400">{stats.allTimeTotal}</strong>
            </div>
          </div>

          {/* 7-DAY BAR CHART */}
          <div className={`${cardClass} p-4 rounded-3xl border shadow-xs space-y-3`}>
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-xs text-[#07382c] dark:text-emerald-300">📊 पिछले 7 दिनों की तस्बीह रिपोर्ट</h3>
              <span className="text-[10px] font-bold text-slate-400">दैनिक गिनती</span>
            </div>

            <div className="flex items-end justify-between gap-2 pt-6 h-40">
              {stats.days.map((d, idx) => {
                const heightPct = d.count === 0 ? 8 : Math.max(15, Math.round((d.count / stats.maxDayCount) * 100));
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                    <span className="text-[10px] font-mono font-extrabold text-slate-600 dark:text-slate-300">
                      {d.count}
                    </span>
                    <div className="w-full max-w-[30px] bg-slate-100 dark:bg-slate-700 rounded-xl overflow-hidden flex flex-col justify-end h-24 p-0.5">
                      <div
                        className={`w-full rounded-lg transition-all duration-500 ${
                          d.isToday
                            ? 'bg-gradient-to-t from-amber-500 to-amber-300'
                            : d.count > 0
                              ? 'bg-gradient-to-t from-[#07382c] to-emerald-500'
                              : 'bg-slate-300 dark:bg-slate-600'
                        }`}
                        style={{ height: `${heightPct}%` }}
                      />
                    </div>
                    <div className="text-center leading-tight">
                      <span className={`text-[10px] block font-bold ${d.isToday ? 'text-amber-600 dark:text-amber-400 font-black' : 'text-slate-500'}`}>
                        {d.isToday ? 'आज' : d.dayShort}
                      </span>
                      <span className="text-[9px] text-slate-400 font-mono">{d.dateNum}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* MOTIVATIONAL HADITH NOTE */}
          <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-center space-y-1">
            <p className="font-arabic text-base font-bold text-[#07382c] dark:text-emerald-300">
              أَلَا بِذِكْرِ اللَّهِ تَطْمَئِنُّ الْقُلُوبُ
            </p>
            <p className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-400">
              “बेशक अल्लाह के ज़िक्र से ही दिलों को सुकून मिलता है।” (सुरह अर-रअद: 28)
            </p>
          </div>
        </div>
      )}
    </main>
  );
};
