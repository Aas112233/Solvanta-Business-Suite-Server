export default function AppLoader() {
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-50/60 backdrop-blur-md dark:bg-[#0F1E2E]/80 transition-all duration-500">
            <div className="relative flex flex-col items-center justify-center pt-24">
                {/* Ambient Background Glow */}
                <div className="absolute top-[40%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-28 bg-[#2D7FF9]/30 blur-[40px] rounded-full animate-[pulse_3s_ease-in-out_infinite]"></div>

                {/* Clean Box Container */}
                <div className="relative z-10 bg-white dark:bg-slate-900/50 p-4 rounded-xl shadow-2xl shadow-[#2D7FF9]/10 dark:shadow-none ring-1 ring-slate-200 dark:ring-white/10 backdrop-blur-xl">
                    <img
                        src="/logo.png"
                        alt="Solvanta Logo loading"
                        className="h-10 w-10 opacity-90 animate-[pulse_2s_ease-in-out_infinite]"
                    />
                </div>

                {/* Elegant Minimal Typography */}
                <div className="absolute -bottom-10 whitespace-nowrap">
                    <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 tracking-[0.25em] animate-[pulse_2s_ease-in-out_infinite]">
                        LOADING...
                    </p>
                </div>
            </div>
        </div>
    );
}
