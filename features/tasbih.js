// features/tasbih.js
window.TasbihFeature = function({ onBack }) {
  const [tasbihStep, setTasbihStep] = React.useState(1);
  const [tasbihCount, setTasbihCount] = React.useState(0);
  const [tasbihLaps, setTasbihLaps] = React.useState(0);

  const handleTasbihTap = () => {
    if (navigator.vibrate) navigator.vibrate(35);
    if (tasbihStep === 1) {
      if (tasbihCount + 1 >= 33) { setTasbihStep(2); setTasbihCount(0); }
      else setTasbihCount(prev => prev + 1);
    } else if (tasbihStep === 2) {
      if (tasbihCount + 1 >= 33) { setTasbihStep(3); setTasbihCount(0); }
      else setTasbihCount(prev => prev + 1);
    } else if (tasbihStep === 3) {
      if (tasbihCount + 1 >= 34) { setTasbihStep(1); setTasbihCount(0); setTasbihLaps(prev => prev + 1); }
      else setTasbihCount(prev => prev + 1);
    }
  };

  return (
    <main className="px-4 py-4 space-y-4 flex-1 text-center z-0 pb-24">
      <button onClick={onBack} className="flex items-center gap-1 text-xs font-bold text-emerald-700 min-h-[40px]">← More</button>
      <div className="flex justify-between items-center">
        <h3 className="font-black text-sm">📿 तस्बीह (चक्कर: {tasbihLaps})</h3>
        <button onClick={() => { setTasbihStep(1); setTasbihCount(0); setTasbihLaps(0); }} className="text-xs text-rose-600 font-bold px-2 py-1 bg-rose-50 rounded-lg">रीसेट</button>
      </div>
      <div className="font-arabic text-3xl text-emerald-800 dark:text-emerald-400 py-4">
        {tasbihStep === 1 ? 'سُبْحَانَ اللَّهِ' : tasbihStep === 2 ? 'الْحَمْدُ لِلَّهِ' : 'اللَّهُ أَكْبَرُ'}
      </div>
      <button onClick={handleTasbihTap} className="w-36 h-36 mx-auto rounded-full bg-gradient-to-br from-[#0c4033] to-[#07382c] text-white flex flex-col justify-center items-center shadow-2xl border-4 border-emerald-300 active:scale-95 transition">
        <span className="text-4xl font-black">{tasbihCount}</span>
        <span className="text-[10px] text-emerald-200 mt-1">टैप करें</span>
      </button>
    </main>
  );
};