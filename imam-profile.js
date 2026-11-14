// imam-profile.js
// Imam Dashboard & Login UI (Separated from core.js)

window.ImamProfileFeature = function ImamProfileFeature({
  loggedImamMasjid,
  favorites,
  darkMode,
  isImamLive,
  adminSupport,
  loginMasjidId,
  setLoginMasjidId,
  loginPasscode,
  setLoginPasscode,
  loginError,
  setLoginError,
  smartRamadan,
  isBlueTickActive,
  isProfileServicesActive,
  isLiveAzanServiceActive,
  openPremiumPaywallModal,
  openEditTimeModal,
  setEditHadithText,
  setEditHadithRef,
  setShowEditHadithModal,
  openRamzanEdit,
  setShowNewNoticeModal,
  openInfoEdit,
  setEditPhotoUrl,
  setEditLat,
  setEditLng,
  setShowEditProfileModal,
  handleImamLogout,
  setDeletePasswordInput,
  setShowDeleteSafetyModal,
  handleStopLiveAzan,
  handleStartLiveAzan,
  handleExecuteImamLogin,
  setShowForgotCredentialsModal,
  setShowRegisterModal,
  VerifiedBadge
}) {
  return (
    <main className={`px-3 py-2 flex-1 z-0 ${loggedImamMasjid ? 'pb-2 max-h-[calc(100dvh-130px)] overflow-y-auto flex flex-col justify-between' : 'pb-24 space-y-4'}`}>
      {loggedImamMasjid ? (
        <div className="h-full flex flex-col justify-between gap-2">
          {/* LIVE FOLLOWERS CARD FOR IMAM */}
          <div className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-gradient-to-r from-[#0c4033] to-[#07382c] border-emerald-800 text-white'} p-2.5 px-3.5 rounded-2xl shadow-sm border flex items-center justify-between shrink-0`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-amber-400/20 border border-amber-300/40 flex items-center justify-center text-base shrink-0 shadow-inner">
                ⭐
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-black tracking-wide text-amber-300">Live Followers</span>
                  {isBlueTickActive(loggedImamMasjid) ? (
                    <VerifiedBadge size="sm" />
                  ) : (
                    <button
                      type="button"
                      onClick={() => openPremiumPaywallModal(loggedImamMasjid, 'blueTick')}
                      className="inline-flex items-center gap-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-[9px] px-2 py-0.5 rounded-full font-bold border border-amber-400/40 cursor-pointer active:scale-95 transition"
                      title="ब्लू टिक अनलॉक करने के लिए क्लिक करें"
                    >
                      <span>🔵</span>
                      <span>ब्लू टिक 🔒</span>
                    </button>
                  )}
                  <span className="inline-flex items-center gap-1 bg-emerald-500/30 text-emerald-300 text-[8.5px] px-1.5 py-0.5 rounded-full font-black border border-emerald-400/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                    LIVE
                  </span>
                </div>
                <p className="text-[10.5px] text-white/90 truncate">
                  {(loggedImamMasjid.followersCount ?? loggedImamMasjid.favoritesCount ?? (favorites.includes(loggedImamMasjid.id) ? 1 : 0))} Muqtadi Starred this Masjid
                </p>
              </div>
            </div>
            <div className="text-right shrink-0 pl-2">
              <span className="text-xl font-mono font-black text-amber-300 block leading-none">
                {(loggedImamMasjid.followersCount ?? loggedImamMasjid.favoritesCount ?? (favorites.includes(loggedImamMasjid.id) ? 1 : 0))}
              </span>
              <span className="text-[8.5px] font-bold text-emerald-200 block mt-0.5 uppercase tracking-wider">Muqtadi</span>
            </div>
          </div>

          {/* LOCK NOTICE BANNER IF PROFILE SERVICES ARE LOCKED */}
          {!isProfileServicesActive(loggedImamMasjid) && (
            <div
              onClick={() => openPremiumPaywallModal(loggedImamMasjid, 'profileServices')}
              className="p-2.5 rounded-2xl bg-amber-500/15 border border-amber-400/60 hover:bg-amber-500/25 text-amber-900 dark:text-amber-200 flex items-center justify-between text-xs font-bold shadow-xs cursor-pointer active:scale-[0.99] transition shrink-0"
            >
              <div className="flex items-center gap-2">
                <span className="text-base">🔒</span>
                <div className="text-left">
                  <span className="block font-black text-amber-950 dark:text-amber-100 text-[11.5px]">प्रोफ़ाइल सेवाएं लॉक हैं (Paid Service)</span>
                  <span className="block text-[10px] text-amber-800 dark:text-amber-300 font-medium">Namaz Time, Hadith व सभी बटन चालू करने के लिए अनलॉक करें</span>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-black text-[11px] shadow-xs shrink-0">
                अनलॉक 💳
              </span>
            </div>
          )}

          {/* WHITE CONTAINER: 2-COLUMN GRID OF 8 COMPACT MOBILE ACTION BUTTONS */}
          <div className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} p-3 rounded-2xl shadow-sm border shrink-0`}>
            <div className="grid grid-cols-2 gap-2">
              {/* Row 1: Namaz Time, Hadith */}
              <button
                type="button"
                onClick={() => {
                  if (!isProfileServicesActive(loggedImamMasjid)) {
                    openPremiumPaywallModal(loggedImamMasjid, 'profileServices');
                    return;
                  }
                  openEditTimeModal(loggedImamMasjid);
                }}
                className="py-2.5 px-2 rounded-xl bg-[#eaf5ed] hover:bg-[#d8eedf] active:bg-[#cbe6d4] dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800/70 flex items-center justify-center gap-1 text-center text-[#07382c] dark:text-emerald-200 font-bold text-xs sm:text-[13px] shadow-xs active:scale-95 transition min-h-[38px]"
              >
                <span>Namaz Time</span>
                {!isProfileServicesActive(loggedImamMasjid) && <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">🔒</span>}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!isProfileServicesActive(loggedImamMasjid)) {
                    openPremiumPaywallModal(loggedImamMasjid, 'profileServices');
                    return;
                  }
                  setEditHadithText(loggedImamMasjid.dailyHadith || '');
                  setEditHadithRef(loggedImamMasjid.dailyHadithRef || '');
                  setShowEditHadithModal(true);
                }}
                className="py-2.5 px-2 rounded-xl bg-[#eaf5ed] hover:bg-[#d8eedf] active:bg-[#cbe6d4] dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800/70 flex items-center justify-center gap-1 text-center text-[#07382c] dark:text-emerald-200 font-bold text-xs sm:text-[13px] shadow-xs active:scale-95 transition min-h-[38px]"
              >
                <span>Hadith</span>
                {!isProfileServicesActive(loggedImamMasjid) && <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">🔒</span>}
              </button>

              {/* Row 2: Sehri / Iftar (+ Moon Confirm indicator), Notice */}
              <button
                type="button"
                onClick={() => {
                  if (!isProfileServicesActive(loggedImamMasjid)) {
                    openPremiumPaywallModal(loggedImamMasjid, 'profileServices');
                    return;
                  }
                  openRamzanEdit();
                }}
                className="py-2.5 px-2 rounded-xl bg-[#eaf5ed] hover:bg-[#d8eedf] active:bg-[#cbe6d4] dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800/70 flex items-center justify-center gap-1 text-center text-[#07382c] dark:text-emerald-200 font-bold text-xs sm:text-[13px] shadow-xs active:scale-95 transition min-h-[38px]"
              >
                <span>Ramzan / Moon</span>
                {smartRamadan && smartRamadan.isMoonConfirmed && <span className="text-[10px] text-emerald-600 dark:text-emerald-300 font-black">✓</span>}
                {!isProfileServicesActive(loggedImamMasjid) && <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">🔒</span>}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!isProfileServicesActive(loggedImamMasjid)) {
                    openPremiumPaywallModal(loggedImamMasjid, 'profileServices');
                    return;
                  }
                  setShowNewNoticeModal(true);
                }}
                className="py-2.5 px-2 rounded-xl bg-[#eaf5ed] hover:bg-[#d8eedf] active:bg-[#cbe6d4] dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800/70 flex items-center justify-center gap-1 text-center text-[#07382c] dark:text-emerald-200 font-bold text-xs sm:text-[13px] shadow-xs active:scale-95 transition min-h-[38px]"
              >
                <span>Notice</span>
                {!isProfileServicesActive(loggedImamMasjid) && <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">🔒</span>}
              </button>

              {/* Row 3: About Masjid, Edit Profile */}
              <button
                type="button"
                onClick={() => {
                  if (!isProfileServicesActive(loggedImamMasjid)) {
                    openPremiumPaywallModal(loggedImamMasjid, 'profileServices');
                    return;
                  }
                  openInfoEdit();
                }}
                className="py-2.5 px-2 rounded-xl bg-[#eaf5ed] hover:bg-[#d8eedf] active:bg-[#cbe6d4] dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800/70 flex items-center justify-center gap-1 text-center text-[#07382c] dark:text-emerald-200 font-bold text-xs sm:text-[13px] shadow-xs active:scale-95 transition min-h-[38px]"
              >
                <span>About Masjid</span>
                {!isProfileServicesActive(loggedImamMasjid) && <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">🔒</span>}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!isProfileServicesActive(loggedImamMasjid)) {
                    openPremiumPaywallModal(loggedImamMasjid, 'profileServices');
                    return;
                  }
                  setEditPhotoUrl(loggedImamMasjid.photo);
                  setEditLat(parseFloat(loggedImamMasjid.lat) || 28.6139);
                  setEditLng(parseFloat(loggedImamMasjid.lng) || 77.2090);
                  setShowEditProfileModal(true);
                }}
                className="py-2.5 px-2 rounded-xl bg-[#eaf5ed] hover:bg-[#d8eedf] active:bg-[#cbe6d4] dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800/70 flex items-center justify-center gap-1 text-center text-[#07382c] dark:text-emerald-200 font-bold text-xs sm:text-[13px] shadow-xs active:scale-95 transition min-h-[38px]"
              >
                <span>Edit Profile</span>
                {!isProfileServicesActive(loggedImamMasjid) && <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">🔒</span>}
              </button>

              {/* Row 4: Logout, Delete Profile */}
              <button
                type="button"
                onClick={handleImamLogout}
                className="py-2.5 px-2 rounded-xl bg-[#eaf5ed] hover:bg-[#d8eedf] active:bg-[#cbe6d4] dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800/70 flex items-center justify-center text-center text-[#07382c] dark:text-emerald-200 font-bold text-xs sm:text-[13px] shadow-xs active:scale-95 transition min-h-[38px]"
              >
                <span>Logout</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!isProfileServicesActive(loggedImamMasjid)) {
                    openPremiumPaywallModal(loggedImamMasjid, 'profileServices');
                    return;
                  }
                  setDeletePasswordInput('');
                  setShowDeleteSafetyModal(true);
                }}
                className="py-2.5 px-2 rounded-xl bg-[#eaf5ed] hover:bg-rose-50 active:bg-rose-100 dark:bg-emerald-950/40 dark:hover:bg-rose-950/40 border border-emerald-200 dark:border-emerald-800/70 hover:border-rose-300 dark:hover:border-rose-800 flex items-center justify-center gap-1 text-center text-[#07382c] dark:text-emerald-200 hover:text-rose-700 dark:hover:text-rose-400 font-bold text-xs sm:text-[13px] shadow-xs active:scale-95 transition min-h-[38px]"
              >
                <span>Delete Profile</span>
                {!isProfileServicesActive(loggedImamMasjid) && <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">🔒</span>}
              </button>
            </div>
          </div>

          {/* COMPACT GLOWING CIRCULAR LIVE AZAN BUTTON */}
          <div className="flex flex-col items-center justify-center py-1.5 relative shrink-0">
            <button
              type="button"
              onClick={() => {
                if (isImamLive) {
                  handleStopLiveAzan(loggedImamMasjid.id);
                } else {
                  if (!isLiveAzanServiceActive(loggedImamMasjid)) {
                    openPremiumPaywallModal(loggedImamMasjid, 'liveAzan');
                    return;
                  }
                  handleStartLiveAzan(loggedImamMasjid.id);
                }
              }}
              className={`w-28 h-28 sm:w-32 sm:h-32 rounded-full flex flex-col items-center justify-center text-white font-extrabold shadow-2xl active:scale-95 transition-all duration-300 relative cursor-pointer ${
                isImamLive
                  ? 'bg-rose-700 ring-6 ring-rose-400/50 shadow-rose-600/60 animate-pulse'
                  : 'bg-[#d61818] ring-6 ring-rose-200/70 dark:ring-rose-900/40 shadow-rose-500/40 hover:bg-[#b91212]'
              }`}
            >
              <div className="text-xl font-black mb-0.5 tracking-widest flex items-center gap-1">
                <span className="text-base">((</span>
                <span className="w-2.5 h-2.5 rounded-full bg-white inline-block"></span>
                <span className="text-base">))</span>
              </div>
              <span className="text-[11px] font-black tracking-wide leading-tight text-center px-2">
                {isImamLive ? 'Stop Live Azan' : (!isLiveAzanServiceActive(loggedImamMasjid) ? 'Live Azan 🔒 (Unlock)' : 'Start Live Azan')}
              </span>
            </button>
          </div>

          {/* 7-DAY EXPIRY RENEWAL NOTIFICATION - ONLY VISIBLE 7 DAYS BEFORE EXPIRY TO LOGGED-IN IMAM */}
          {(() => {
            const m = loggedImamMasjid;
            if (!m) return null;
            const isExp = m.paymentStatus === 'expired';
            let daysLeft = null;
            if (m.paymentExpiry) {
              const expDate = new Date(m.paymentExpiry + 'T23:59:59').getTime();
              if (!isNaN(expDate)) {
                const diff = expDate - Date.now();
                daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24));
              }
            }
            const showCountdown = isExp || (daysLeft !== null && daysLeft <= 7);
            if (!showCountdown) return null;

            return (
              <div className="mt-2.5 max-w-sm mx-auto w-full p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-center space-y-1.5 shadow-xs animate-in fade-in">
                <div className="flex items-center justify-center gap-1.5 text-xs font-black text-amber-900 dark:text-amber-200">
                  <span>⏳</span>
                  <span>{isExp ? 'प्रीमियम सदस्यता समाप्त (Expired)' : `${daysLeft > 0 ? daysLeft : 0} दिन शेष • अपनी प्रीमियम सदस्यता जारी रखें`}</span>
                </div>
                <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-snug font-medium">
                  समय रहते Renewal करवाएँ, ताकि आपकी मस्जिद का ब्लू टिक व सेवाएं बाक़ी रहें।
                </p>
                <button
                  type="button"
                  onClick={() => openPremiumPaywallModal(m)}
                  className="w-full py-2 bg-gradient-to-r from-[#0c4033] to-[#07382c] hover:from-[#092e24] hover:to-[#05281e] text-white rounded-xl text-xs font-black shadow active:scale-95 transition flex items-center justify-center gap-1.5"
                >
                  <span>💳</span>
                  <span>₹{adminSupport.premiumFeeAmount || 499} Renewal करें (पेमेंट डिटेल्स भरें) →</span>
                </button>
              </div>
            );
          })()}
        </div>
      ) : (
        <div className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} p-5 rounded-3xl shadow-sm border space-y-4`}>
          <div className="text-center pb-1">
            <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-slate-700 text-emerald-800 dark:text-emerald-300 text-3xl mx-auto flex justify-center items-center">👳</div>
            <h3 className="font-black text-sm mt-2">Imam Login</h3>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); handleExecuteImamLogin(loginMasjidId, loginPasscode); }} className="space-y-3 text-xs">
            <div><input type="text" value={loginMasjidId} onChange={(e) => { setLoginMasjidId(e.target.value); setLoginError(false); }} placeholder="Mosque ID (e.g. MASJID-101) *" required className="w-full p-2.5 border rounded-2xl uppercase font-bold dark:bg-slate-700 dark:border-slate-600" /></div>
            <div><input type="password" value={loginPasscode} onChange={(e) => { setLoginPasscode(e.target.value); setLoginError(false); }} placeholder="Password (e.g. 786) *" required className="w-full p-2.5 border rounded-2xl font-bold dark:bg-slate-700 dark:border-slate-600" /></div>
            {loginError && <div className="p-2 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-700 dark:text-rose-400 font-bold"><p>⚠️ Invalid Mosque ID or Password!</p><button type="button" onClick={() => setShowForgotCredentialsModal(true)} className="underline text-[11px] mt-1">👉 Find ID or Reset Password</button></div>}
            <button type="submit" className="w-full py-3 bg-[#07382c] text-white font-extrabold rounded-2xl text-xs">🔐 Login</button>
            <div className="text-center pt-1"><button type="button" onClick={() => setShowForgotCredentialsModal(true)} className="text-emerald-700 dark:text-emerald-400 font-extrabold text-[11px] underline">🔑 Forgot Mosque ID or Password?</button></div>
          </form>
          <div className="pt-2 border-t dark:border-slate-700 text-center space-y-2">
            <p className="text-[11px] text-slate-500">Is your mosque not registered yet?</p>
            <button type="button" onClick={() => setShowRegisterModal(true)} className="w-full py-2.5 bg-emerald-50 dark:bg-slate-700 text-emerald-800 dark:text-emerald-300 font-bold rounded-2xl border border-emerald-200 dark:border-slate-600">➕ Register New Mosque</button>
          </div>
        </div>
      )}
    </main>
  );
};
