import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles,
  ArrowRight,
  FileText,
  GraduationCap,
  Brain,
  Users,
  BookOpen,
  Database,
  Play,
  ArrowDown,
  Lock,
  User,
  Check,
  Code2
} from 'lucide-react';
import { DocumentSummary } from '../types';
import { auth, useAuth } from '../lib/auth';
import { SupabaseAuthModal } from './SupabaseAuthModal';
import { WatchDemoModal } from './WatchDemoModal';
import { useModal } from '../lib/useModal';

interface LandingViewProps {
  onLaunchApp: (tab?: 'Journal' | 'Dashboard') => void;
  onOpenNewSummary: () => void;
  onOpenArchitecture: () => void;
}

export const LandingView: React.FC<LandingViewProps> = ({
  onLaunchApp,
  onOpenNewSummary,
  onOpenArchitecture,
}) => {
  // Parallax scroll position tracker
  const [scrollY, setScrollY] = useState(0);

  // Supabase Auth state
  const authState = useAuth();
  const session = authState.status === 'signedIn' ? authState : null;
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isWatchDemoOpen, setIsWatchDemoOpen] = useState(false);
  const [showRlsModal, setShowRlsModal] = useState(false);
  const rlsRef = useModal<HTMLDivElement>(showRlsModal, () => setShowRlsModal(false));

  // Active Headline Switcher
  const headlineVariants = [
    'Understand more. Read less.',
    'Turn papers into insight.',
    'Read smarter, not longer.'
  ];
  const [headlineIndex, setHeadlineIndex] = useState(0);

  // Traction badge toggle
  const [badgeVariant, setBadgeVariant] = useState(0);
  const badges = [
    'PDF, Word, text and web links 📄',
    'Summaries in English and Kiswahili 🌍',
    'Your summaries stay private to your account 🔒'
  ];

  // Three hand-written examples that show the shape of a summary. Nothing here is generated live.
  const demoSamples = [
    {
      id: 'cs',
      label: 'Computer Science (CSIT-402)',
      title: 'Attention Mechanisms and Transformer Architectures',
      source: 'The transformer architecture fundamentally abandoned recurrence and convolutions, relying entirely on an attention mechanism to model global dependencies between input tokens and output predictions. Multi-head self-attention allows the model to jointly attend to information from different representation subspaces at different positions. In empirical benchmarks on WMT 2014 English-to-German and English-to-French translation tasks, transformers established state-of-the-art BLEU scores while requiring an order of magnitude less training time than recurrent models.',
      summary: 'Transformer models eliminate recurrence in favor of multi-head self-attention mechanisms, capturing long-range token relationships simultaneously. This design achieves state-of-the-art translation accuracy with dramatically faster training parallelization.',
      takeaways: [
        'Multi-Head Self-Attention replaces recurrent sequential bottlenecks.',
        'Positions are encoded using positional sinusoidal or learned embeddings.',
        'High computational efficiency allows massive parallelization across GPU clusters.'
      ],
    },
    {
      id: 'lead',
      label: 'Leadership (LEAD-401)',
      title: 'New Horizons of Confidence and Proactive Initiative',
      source: 'Reflecting on personal leadership development over the academic semester reveals significant cognitive shifts. Initial fears of failure frequently immobilized proactive action, producing excessive self-criticism. Transitioning toward a growth mindset recontextualized errors into formative data points. By deliberately taking small risks, such as leading group seminar presentations and initiating peer study workshops, self-efficacy increased progressively.',
      summary: 'A structured shift from avoidance of failure to proactive risk-taking builds leadership resilience. Celebrating small incremental milestones creates sustainable self-efficacy during demanding university coursework.',
      takeaways: [
        'Reframing errors as feedback loops mitigates pre-examination paralysis.',
        'Initiative in small group settings directly correlates with higher academic engagement.',
        'Metacognitive reflection journals cement emotional resilience.'
      ],
    },
    {
      id: 'econ',
      label: 'Economics (ECON-201)',
      title: 'Monetary Policy Constraints in Developing Economies',
      source: 'Central banking frameworks across sub-Saharan economies confront structural challenges regarding interest rate transmission channels. Elevated informal financial sectors and supply-side price shocks frequently diminish the efficacy of standard policy interest rate adjustments. Mitigating imported inflation while fostering sustainable capital expenditure demands integrated foreign exchange reserves management and targeted liquidity interventions.',
      summary: 'Monetary policy in developing markets faces unique hurdles from informal financial networks and supply-side vulnerability, necessitating targeted reserve management alongside traditional interest rate levers.',
      takeaways: [
        'Standard interest rate transmission is attenuated by informal banking systems.',
        'Supply-side shocks in food and energy require coordinated fiscal-monetary responses.',
        'Foreign exchange buffer adequacy is critical for currency stability.'
      ],
    }
  ];

  const [activeDemoIndex, setActiveDemoIndex] = useState(0);
  const currentSample = demoSamples[activeDemoIndex];
  const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;
  const sampleWords = wordCount(currentSample.source);
  const sampleSummaryWords = wordCount([currentSample.summary, ...currentSample.takeaways].join(' '));
  const sampleShorter = Math.max(0, Math.round((1 - sampleSummaryWords / sampleWords) * 100));

  // Window scroll event listener for multi-layer parallax depth
  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Protected route action handler
  const handleProtectedAction = (tab: 'Journal' | 'Dashboard' = 'Dashboard') => {
    if (session) {
      onLaunchApp(tab);
    } else {
      setIsAuthModalOpen(true);
    }
  };

  const scrollToContent = () => {
    const howItWorksSection = document.getElementById('how-it-works');
    if (howItWorksSection) {
      howItWorksSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Parallax calculations (bounded to ~1 viewport height)
  const maxHeroScroll = 900;
  const clampedScroll = Math.min(scrollY, maxHeroScroll);
  
  // Layer 0: Cathedral library / golden-hour study hall (slowest, 12% speed)
  const layer0Y = clampedScroll * 0.12;
  // Layer 1: Knowledge graph & synaptic network (25% speed)
  const layer1Y = clampedScroll * 0.25;
  // Layer 2: Floating scattered papers & notes (42% speed)
  const layer2Y = clampedScroll * 0.42;
  // Layer 3: Crystal structured summary cards (62% speed)
  const layer3Y = clampedScroll * 0.62;
  // Hero text: fades smoothly as user scrolls past
  const heroOpacity = Math.max(0, 1 - clampedScroll / 600);
  const heroTranslateY = clampedScroll * 0.28;

  return (
    <div className="relative w-full text-slate-800 selection:bg-amber-100 selection:text-amber-900">
      
      {/* ========================================================= */}
      {/* 1. FLOATING PILL NAVBAR MATCHING REFERENCE IMAGE          */}
      {/* ========================================================= */}
      <nav 
        className="fixed top-5 left-1/2 -translate-x-1/2 z-50 w-[94%] max-w-4xl bg-white/95 backdrop-blur-md rounded-full px-4 sm:px-6 py-2.5 shadow-xl shadow-slate-900/10 border border-slate-200/90 flex items-center justify-between transition-all duration-300"
      >
        {/* Left: Pill Wordmark Logo */}
        <div 
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="flex items-center gap-2.5 cursor-pointer select-none group"
        >
          {/* Logo icon matching Haven reference style */}
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-600 via-amber-500 to-orange-400 flex items-center justify-center text-white shadow-sm group-hover:scale-105 transition-transform">
            <span className="text-base font-bold">◈</span>
          </div>
          <span className="font-extrabold text-base tracking-tight text-slate-900">
            Synth
          </span>
          <span className="hidden sm:inline-block text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
            Academic
          </span>
        </div>

        {/* Center: Navigation Links */}
        <div className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-600">
          <button 
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="hover:text-slate-950 transition-colors"
          >
            Home
          </button>
          <button 
            onClick={() => scrollToSection('how-it-works')}
            className="hover:text-slate-950 transition-colors"
          >
            How it works
          </button>
          <button 
            onClick={() => scrollToSection('use-cases')}
            className="hover:text-slate-950 transition-colors"
          >
            Use Cases
          </button>
          <button 
            onClick={() => scrollToSection('contact')}
            className="hover:text-slate-950 transition-colors"
          >
            Contact
          </button>
        </div>

        {/* Right: Auth Action Buttons */}
        <div className="flex items-center gap-2">
          {session ? (
            /* Authenticated User: routes straight to Dashboard */
            <div className="flex items-center gap-2">
              <div
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-full text-xs font-medium text-slate-700"
                title="Signed in"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-bold text-slate-900 truncate max-w-[90px]">
                  {session.user.fullName.split(' ')[0]}
                </span>
                <span className="text-[10px] text-slate-500 capitalize">({session.user.role})</span>
              </div>

              <button
                onClick={() => void auth.signOut()}
                className="px-3 py-1.5 rounded-full text-xs font-bold text-slate-600 hover:text-slate-950 hover:bg-slate-100 transition-colors"
              >
                Sign out
              </button>

              <button
                onClick={() => onLaunchApp('Dashboard')}
                className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2 rounded-full shadow-md hover:shadow-lg transition-all flex items-center gap-1.5 hover:-translate-y-0.5"
              >
                <span>Dashboard</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            /* Logged Out: Log in outline + Get Started dark pill */
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="px-3.5 py-1.5 rounded-full text-xs font-bold text-slate-700 hover:text-slate-950 hover:bg-slate-100 transition-colors"
              >
                Log in
              </button>
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2 rounded-full shadow-md hover:shadow-lg transition-all flex items-center gap-1"
              >
                <span>Get Started</span>
              </button>
            </div>
          )}
        </div>
      </nav>


      {/* ========================================================= */}
      {/* 2. HERO VIEWPORT WITH MULTI-LAYER PARALLAX SCROLLING       */}
      {/* ========================================================= */}
      <header className="relative w-full min-h-screen flex flex-col items-center justify-center overflow-hidden pt-24 pb-16 px-4">
        
        {/* ------------------------------------------------------- */}
        {/* PARALLAX LAYER 0: ATMOSPHERIC GOLDEN-HOUR STUDY SANCTUARY */}
        {/* ------------------------------------------------------- */}
        <div 
          className="absolute inset-0 pointer-events-none z-0 transition-transform will-change-transform"
          style={{
            transform: `translateY(${layer0Y}px) scale(1.08)`,
          }}
        >
          {/* Rich golden-hour university library atmosphere */}
          <div 
            className="absolute inset-0 bg-cover bg-center opacity-70 filter saturate-110 contrast-105"
            style={{
              backgroundImage: `url('https://images.unsplash.com/photo-1521587760476-6c12a4b040da?auto=format&fit=crop&w=2400&q=85')`,
            }}
          />
          {/* Subtle warm golden sunlight gradient overlay mimicking calm landscape mood */}
          <div className="absolute inset-0 bg-gradient-to-b from-amber-50/75 via-orange-50/40 to-[#F4F6F9]" />
          
          {/* Ambient luminous focal highlights */}
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-amber-300/20 rounded-full blur-[120px] pointer-events-none" />
          <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] bg-orange-400/15 rounded-full blur-[100px] pointer-events-none" />
          <div className="absolute top-1/2 right-1/4 w-[500px] h-[500px] bg-emerald-400/10 rounded-full blur-[120px] pointer-events-none" />
        </div>

        {/* ------------------------------------------------------- */}
        {/* PARALLAX LAYER 1: KNOWLEDGE-GRAPH & SYNAPTIC NODES       */}
        {/* ------------------------------------------------------- */}
        <div 
          className="absolute inset-0 pointer-events-none z-1 transition-transform will-change-transform flex items-center justify-center"
          style={{
            transform: `translateY(${layer1Y}px)`,
          }}
        >
          <svg className="w-full h-full opacity-35 max-w-6xl mx-auto" viewBox="0 0 1000 600" fill="none">
            {/* Synaptic interconnecting lines representing synthesized concepts */}
            <path d="M150,180 Q320,120 500,240 T850,200" stroke="#D97706" strokeWidth="1.5" strokeDasharray="4 4" />
            <path d="M220,380 Q450,420 620,310 T880,380" stroke="#059669" strokeWidth="1.5" strokeDasharray="3 3" />
            <path d="M300,150 L500,240 L620,310 L750,180" stroke="#2563EB" strokeWidth="1" opacity="0.6" />
            
            {/* Knowledge Nodes */}
            <g className="animate-pulse" style={{ animationDuration: '4s' }}>
              <circle cx="150" cy="180" r="8" fill="#F59E0B" />
              <circle cx="150" cy="180" r="18" stroke="#F59E0B" strokeWidth="1" opacity="0.4" />
              <text x="170" y="185" fill="#78350F" fontSize="12" fontWeight="bold">Attention Mechanism</text>

              <circle cx="500" cy="240" r="10" fill="#10B981" />
              <circle cx="500" cy="240" r="22" stroke="#10B981" strokeWidth="1" opacity="0.4" />
              <text x="520" y="245" fill="#064E3B" fontSize="12" fontWeight="bold">Structured Summary</text>

              <circle cx="850" cy="200" r="9" fill="#3B82F6" />
              <circle cx="850" cy="200" r="20" stroke="#3B82F6" strokeWidth="1" opacity="0.4" />
              <text x="730" y="225" fill="#1E3A8A" fontSize="12" fontWeight="bold">Socratic Active Recall</text>

              <circle cx="620" cy="310" r="7" fill="#8B5CF6" />
              <text x="640" y="315" fill="#4C1D95" fontSize="11" fontWeight="bold">Spaced Review</text>
            </g>
          </svg>
        </div>

        {/* ------------------------------------------------------- */}
        {/* PARALLAX LAYER 2: SCATTERED UNSTRUCTURED PAPERS DRIFTING */}
        {/* ------------------------------------------------------- */}
        <div 
          className="absolute inset-0 pointer-events-none z-2 transition-transform will-change-transform overflow-hidden"
          style={{
            transform: `translateY(${layer2Y}px)`,
          }}
        >
          {/* Left floating raw paper sheet */}
          <div className="absolute top-[28%] left-[5%] lg:left-[10%] w-48 sm:w-56 p-4 rounded-2xl bg-white/70 backdrop-blur-md shadow-lg border border-slate-200/80 -rotate-6 hidden sm:block opacity-60">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 mb-2">
              <FileText className="w-3 h-3 text-red-500" />
              <span>Long lecture notes</span>
            </div>
            <div className="space-y-1.5">
              <div className="h-2 bg-slate-300 rounded w-full" />
              <div className="h-2 bg-slate-200 rounded w-5/6" />
              <div className="h-2 bg-slate-300 rounded w-4/6" />
              <div className="h-2 bg-slate-200 rounded w-full" />
            </div>
            <span className="block mt-3 text-[9px] font-mono text-slate-400">Chaos: 12,400 words</span>
          </div>

          {/* Right floating draft paper sheet */}
          <div className="absolute top-[35%] right-[5%] lg:right-[8%] w-52 sm:w-60 p-4 rounded-2xl bg-white/70 backdrop-blur-md shadow-lg border border-slate-200/80 rotate-8 hidden sm:block opacity-60">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 mb-2">
              <BookOpen className="w-3 h-3 text-blue-500" />
              <span>Complex Theoretical Paper</span>
            </div>
            <div className="space-y-1.5">
              <div className="h-2 bg-slate-300 rounded w-full" />
              <div className="h-2 bg-slate-200 rounded w-3/4" />
              <div className="h-2 bg-slate-300 rounded w-5/6" />
            </div>
            <span className="block mt-3 text-[9px] font-mono text-slate-400">Information Overload</span>
          </div>
        </div>

        {/* ------------------------------------------------------- */}
        {/* PARALLAX LAYER 3: STRUCTURED SYNTHESIZED CARDS RESOLVING */}
        {/* ------------------------------------------------------- */}
        <div 
          className="absolute inset-0 pointer-events-none z-3 transition-transform will-change-transform overflow-hidden"
          style={{
            transform: `translateY(${layer3Y}px)`,
          }}
        >
          {/* Bottom Left: Crystal Clear Takeaway Card */}
          <div className="absolute bottom-[16%] left-[4%] lg:left-[12%] w-64 p-4 rounded-2xl bg-white/95 backdrop-blur-md shadow-xl border border-emerald-200/80 -rotate-2 hidden md:block">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5 text-emerald-600" />
                Example
              </span>
              <span className="text-[10px] font-mono text-slate-400">illustration</span>
            </div>
            <p className="text-xs font-semibold text-slate-800 leading-snug">
              Multi-head attention eliminates recurrent latency for parallel gradient descent.
            </p>
          </div>

          {/* Bottom Right: Socratic Active Recall Card */}
          <div className="absolute bottom-[20%] right-[4%] lg:right-[12%] w-64 p-4 rounded-2xl bg-white/95 backdrop-blur-md shadow-xl border border-blue-200/80 rotate-3 hidden md:block">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 flex items-center gap-1">
                <Brain className="w-2.5 h-2.5 text-blue-600" />
                Active Recall Prompt
              </span>
              <span className="text-[10px] font-mono text-slate-400">Exam Prep</span>
            </div>
            <p className="text-xs font-semibold text-slate-800 leading-snug">
              Why does informal liquidity attenuate monetary interest rate transmission?
            </p>
          </div>
        </div>

        {/* ------------------------------------------------------- */}
        {/* PARALLAX HERO CONTENT (NORMAL SPEED & GENTLE FADEOUT)   */}
        {/* ------------------------------------------------------- */}
        <div 
          className="relative z-10 max-w-3xl mx-auto text-center space-y-6 will-change-transform"
          style={{
            opacity: heroOpacity,
            transform: `translateY(${heroTranslateY}px)`,
          }}
        >
          {/* Badge: Replace "We just raised 20M" with Credibility / Traction Badge */}
          <div className="inline-block">
            <button
              onClick={() => setBadgeVariant((prev) => (prev + 1) % badges.length)}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/90 hover:bg-white text-slate-800 text-xs font-semibold shadow-md shadow-slate-900/5 border border-slate-200/80 backdrop-blur-md transition-all hover:scale-105 active:scale-95 cursor-pointer"
            >
              <span>{badges[badgeVariant]}</span>
              <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">click</span>
            </button>
          </div>

          {/* Main Headline */}
          <div className="space-y-2">
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-slate-950 leading-[1.08] font-sans">
              {headlineVariants[headlineIndex]}
            </h1>

            {/* Quick variant indicator dots */}
            <div className="flex items-center justify-center gap-1.5 pt-1">
              {headlineVariants.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setHeadlineIndex(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    i === headlineIndex ? 'w-6 bg-slate-900' : 'w-1.5 bg-slate-300 hover:bg-slate-400'
                  }`}
                  title={headlineVariants[i]}
                />
              ))}
            </div>
          </div>

          {/* Subheadline matching reference rhythm: "So you can take a breath." */}
          <p className="text-sm sm:text-lg text-slate-700 max-w-2xl mx-auto leading-relaxed font-normal">
            Upload lecture notes and research papers. Get a structured summary, key points and discussion questions for revision.
            <span className="block mt-2 font-medium text-slate-800">
              So you can take a breath.
            </span>
          </p>

          {/* CTAs matching reference: Get Started -> (filled pill) and Watch Demo (ghost link) */}
          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            <button
              onClick={() => handleProtectedAction('Dashboard')}
              className="px-7 py-3.5 bg-white hover:bg-slate-50 text-slate-950 font-bold text-sm sm:text-base rounded-full shadow-lg shadow-slate-900/10 hover:shadow-xl hover:shadow-slate-900/15 border border-slate-200/80 flex items-center gap-2 transition-all hover:-translate-y-0.5 active:translate-y-0"
            >
              <span>Get Started</span>
              <ArrowRight className="w-4 h-4 text-slate-900" />
            </button>

            <button
              onClick={() => setIsWatchDemoOpen(true)}
              className="px-5 py-3.5 text-slate-800 hover:text-slate-950 font-semibold text-sm sm:text-base flex items-center gap-2 transition-colors group"
            >
              <div className="w-7 h-7 rounded-full bg-slate-900/10 group-hover:bg-slate-900/20 flex items-center justify-center transition-colors">
                <Play className="w-3.5 h-3.5 text-slate-900 fill-slate-900 ml-0.5" />
              </div>
              <span>Watch Demo</span>
            </button>
          </div>

          {/* Academic Attribution Sub-bar */}
          <div className="pt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-600">
            <span className="font-semibold text-slate-900">The East Africa University</span>
            <span>•</span>
            <span className="text-emerald-700 font-medium">Open-weights AI summarization</span>
          </div>
        </div>

        {/* ------------------------------------------------------- */}
        {/* PILL-SHAPED "SCROLL ↓" INDICATOR MATCHING REFERENCE     */}
        {/* ------------------------------------------------------- */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20">
          <button
            onClick={scrollToContent}
            className="px-5 py-2 rounded-full bg-slate-900/80 hover:bg-slate-900 text-white backdrop-blur-md border border-white/20 text-[11px] font-bold tracking-widest uppercase flex items-center gap-1.5 shadow-lg shadow-black/10 transition-all hover:scale-105 active:scale-95 animate-bounce"
          >
            <span>SCROLL</span>
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
        </div>

      </header>


      {/* ========================================================= */}
      {/* 3. NORMAL SCROLL CONTENT HANDOFF: HOW IT WORKS            */}
      {/* ========================================================= */}
      <div id="how-it-works" className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-20 space-y-20">
        
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100/70 border border-amber-200 text-amber-800 text-xs font-bold">
            <Sparkles className="w-3.5 h-3.5 text-amber-700" />
            <span>Clarity Out Of Chaos</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-950 tracking-tight">
            How Knowledge Gets Distilled
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            From long readings to a structured summary and revision questions.
          </p>
        </div>

        {/* 3-Step Interactive Visual Transformation */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
          
          {/* Step 1: Input */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm hover:shadow-md transition-shadow space-y-4 relative group">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center font-bold text-lg">
              01
            </div>
            <div className="space-y-1.5">
              <h3 className="font-bold text-base text-slate-950">Ingest Chaotic Materials</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Upload PDF, Word, text or Markdown files, paste a web link, or paste your notes. Scanned PDFs are read with OCR, so check the result for recognition errors.
              </p>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 font-mono text-[10px] text-slate-500">
              ✓ Multi-page PDF parser<br />
              ✓ Scanned pages read with OCR<br />
              ✓ Automatic noise stripping
            </div>
          </div>

          {/* Step 2: Transformer Synthesis */}
          <div className="bg-white rounded-3xl p-6 border border-amber-300 shadow-sm hover:shadow-md transition-shadow space-y-4 relative group ring-2 ring-amber-400/20">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-lg">
              02
            </div>
            <div className="space-y-1.5">
              <h3 className="font-bold text-base text-slate-950">AI Summarization</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                An open-weights language model writes an abstractive summary, or TextRank picks the key sentences and quotes them from your document (extractive). Long documents are read in sections.
              </p>
            </div>
            <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-100 font-mono text-[10px] text-amber-800">
              ✓ Concise, balanced or detailed length<br />
              ✓ English & Swahili support<br />
              ✓ Figures checked against the source
            </div>
          </div>

          {/* Step 3: Active Retention */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm hover:shadow-md transition-shadow space-y-4 relative group">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-lg">
              03
            </div>
            <div className="space-y-1.5">
              <h3 className="font-bold text-base text-slate-950">Socratic Active Recall</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Every summary comes with discussion questions, and a 1, 3, 7 and 30 day review schedule based on when you made it.
              </p>
            </div>
            <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100 font-mono text-[10px] text-emerald-800">
              ✓ Discussion questions<br />
              ✓ Spaced review schedule<br />
              ✓ Comments and notes on each summary
            </div>
          </div>

        </div>

        {/* Interactive Model Sandbox */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200 mb-1 inline-block">
                Examples
              </span>
              <h3 className="text-lg sm:text-xl font-bold text-slate-900">
                What a summary looks like
              </h3>
              <p className="text-xs text-slate-500">
                Three short examples, written by hand to show the format. They are not generated live; create a summary of your own document to see the real thing.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {demoSamples.map((sample, idx) => (
                <button
                  key={sample.id}
                  onClick={() => setActiveDemoIndex(idx)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    activeDemoIndex === idx
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {sample.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Raw Text Left */}
            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-amber-600" />
                    Source excerpt
                  </span>
                  <span className="text-[10px] font-mono text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                    {sampleWords} words
                  </span>
                </div>
                <h4 className="font-bold text-xs text-slate-900">{currentSample.title}</h4>
                <p className="text-xs text-slate-600 leading-relaxed font-serif bg-white p-3.5 rounded-xl border border-slate-200 max-h-48 overflow-y-auto">
                  {currentSample.source}
                </p>
              </div>
            </div>

            {/* Synthesized Cards Right */}
            <div className="bg-amber-50/40 p-5 rounded-2xl border border-amber-200/80 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    Summary
                  </span>
                  <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-300">
                    {sampleShorter}% shorter
                  </span>
                </div>

                <div className="p-3.5 bg-white rounded-xl border border-amber-100 shadow-2xs space-y-2">
                  <p className="text-xs font-medium text-slate-800 leading-relaxed">
                    {currentSample.summary}
                  </p>

                  <div className="pt-2 border-t border-slate-100 space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Key points:
                    </span>
                    {currentSample.takeaways.map((item, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-slate-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-amber-200 flex items-center justify-between">
                <span className="text-[11px] text-amber-900">Hand-written example</span>

                <button
                  onClick={() => (session ? onOpenNewSummary() : setIsAuthModalOpen(true))}
                  className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-full flex items-center gap-1.5 shadow-xs transition-colors"
                >
                  <span>Summarise your own document</span>
                  <ArrowRight className="w-3 h-3 text-amber-400" />
                </button>
              </div>

            </div>

          </div>
        </div>

      </div>


      {/* ========================================================= */}
      {/* 4. USE CASES SECTION (STUDENTS, RESEARCHERS, FACULTY)    */}
      {/* ========================================================= */}
      <div id="use-cases" className="w-full bg-white py-20 border-y border-slate-200/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-12">
          
          <div className="text-center max-w-xl mx-auto space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">
              <Users className="w-3.5 h-3.5" />
              <span>Tailored For Academic Demands</span>
            </div>
            <h2 className="text-3xl font-extrabold text-slate-950 tracking-tight">
              Built for Every Role in Higher Education
            </h2>
            <p className="text-xs sm:text-sm text-slate-600">
              For revising a course, or for reading a long paper quickly.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Persona 1 */}
            <div className="p-6 rounded-3xl bg-slate-50 border border-slate-200/80 space-y-4 hover:border-amber-300 transition-colors">
              <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">Undergrad & Postgrad Students</h3>
                <p className="text-xs text-slate-600 mt-1">
                  Summarise lecture notes and readings, revise with discussion questions, and keep your own notes beside each summary.
                </p>
              </div>
              <ul className="text-xs text-slate-700 space-y-2 pt-3 border-t border-slate-200/70">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Revision questions for each summary</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>1, 3, 7 and 30 day review schedule</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Export to PDF, Word, text or Markdown</span>
                </li>
              </ul>
            </div>

            {/* Persona 2 */}
            <div className="p-6 rounded-3xl bg-slate-50 border border-slate-200/80 space-y-4 hover:border-amber-300 transition-colors">
              <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                <Brain className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">Academic Researchers</h3>
                <p className="text-xs text-slate-600 mt-1">
                  Get the main argument, methods and findings of a long paper, then check them against the source.
                </p>
              </div>
              <ul className="text-xs text-slate-700 space-y-2 pt-3 border-t border-slate-200/70">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Extractive vs Abstractive triage</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Side-by-side source verification view</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Warns about figures not found in the source</span>
                </li>
              </ul>
            </div>

            {/* Persona 3 */}
            <div className="p-6 rounded-3xl bg-slate-50 border border-slate-200/80 space-y-4 hover:border-amber-300 transition-colors">
              <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">Faculty & Supervisors</h3>
                <p className="text-xs text-slate-600 mt-1">
                  See how well the summarizer is working for your students, without seeing any of their work.
                </p>
              </div>
              <ul className="text-xs text-slate-700 space-y-2 pt-3 border-t border-slate-200/70">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Average ratings across all users</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Groups too small to identify anyone are hidden</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Faculty accounts are set up by an administrator</span>
                </li>
              </ul>
            </div>

          </div>

        </div>
      </div>


      {/* ========================================================= */}
      {/* 6. SUPABASE ARCHITECTURE & RLS EXPLAINER CALLOUT          */}
      {/* ========================================================= */}
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 pb-20">
        <div className="bg-gradient-to-r from-slate-900 via-[#182033] to-slate-900 rounded-3xl p-6 sm:p-8 text-white border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono text-[10px] uppercase font-bold">
                Sign-in and privacy
              </span>
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-white">
              Your work is visible only to you
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Each account can read only its own summaries, notes, comments and ratings. The database enforces this with Row Level Security, so it does not depend on the app behaving. Faculty accounts, which an administrator sets up, see only averaged ratings, never anyone's documents.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-full shadow-md transition-all flex items-center gap-2"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Sign in or create an account</span>
            </button>
            <button
              onClick={() => setShowRlsModal(true)}
              className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white font-semibold text-xs rounded-full border border-white/15 transition-all flex items-center gap-1.5"
            >
              <Code2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>How privacy works</span>
            </button>
          </div>
        </div>
      </div>


      {/* ========================================================= */}
      {/* 7. CONTACT & ACADEMIC ATTRIBUTION FOOTER                  */}
      {/* ========================================================= */}
      <footer id="contact" className="w-full bg-[#111622] text-slate-300 py-16 border-t border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-12">
          
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-12 border-b border-slate-800">
            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-600 via-amber-500 to-orange-400 flex items-center justify-center text-white font-bold text-base shadow-sm">
                  ◈
                </div>
                <span className="font-extrabold text-xl tracking-tight text-white">
                  Synth
                </span>
                <span className="text-xs text-slate-400 font-mono">Academic AI</span>
              </div>
              <p className="text-xs text-slate-400 max-w-md leading-relaxed">
                Academic summarization and revision tool developed for The East Africa University.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => handleProtectedAction('Journal')}
                className="px-5 py-2.5 bg-white hover:bg-slate-100 text-slate-950 font-bold text-xs rounded-full shadow-sm transition-all"
              >
                Launch Workspace
              </button>
              <button
                onClick={onOpenArchitecture}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-full transition-colors"
              >
                How it works
              </button>
            </div>
          </div>

          {/* Academic Attribution Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-xs">
            <div className="space-y-1.5">
              <span className="text-slate-400 text-[10px] uppercase tracking-wider font-bold block">Institution</span>
              <p className="font-bold text-white">The East Africa University</p>
              <p className="text-slate-400">School of Computer Science & IT</p>
            </div>

            <div className="space-y-1.5">
              <span className="text-slate-400 text-[10px] uppercase tracking-wider font-bold block">Lead Researcher</span>
              <p className="font-bold text-white">Noel Juma Muhemba</p>
              <p className="text-amber-400 font-mono">Reg No: BCSITP/0003/S24</p>
            </div>

            <div className="space-y-1.5">
              <span className="text-slate-400 text-[10px] uppercase tracking-wider font-bold block">Supervisor</span>
              <p className="font-bold text-white">Mr. Geoffrey Sagwe</p>
              <p className="text-slate-400">Dept. of Computer Science</p>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
            <p>© 2026 Synth Academic AI • The East Africa University. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <button onClick={() => setShowRlsModal(true)} className="hover:text-slate-300 transition-colors">Privacy</button>
              <button onClick={() => setIsAuthModalOpen(true)} className="hover:text-slate-300 transition-colors">Sign in</button>
              <button onClick={onOpenArchitecture} className="hover:text-slate-300 transition-colors">How it works</button>
            </div>
          </div>

        </div>
      </footer>


      {/* ========================================================= */}
      {/* MODALS & PORTALS                                          */}
      {/* ========================================================= */}
      <SupabaseAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={() => {
          onLaunchApp('Dashboard');
        }}
      />

      <WatchDemoModal
        isOpen={isWatchDemoOpen}
        onClose={() => setIsWatchDemoOpen(false)}
        onLaunchWorkspace={() => onLaunchApp('Journal')}
      />

      {/* How the privacy rule is enforced: the real policy from supabase/migrations */}
      {showRlsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in">
          <div
            ref={rlsRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rls-title"
            tabIndex={-1}
            className="bg-slate-900 text-white w-full max-w-xl rounded-3xl p-6 border border-slate-800 shadow-2xl space-y-4 outline-hidden"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-400" />
                <h4 id="rls-title" className="font-bold text-sm">How your data is kept private</h4>
              </div>
              <button onClick={() => setShowRlsModal(false)} aria-label="Close" className="text-slate-400 hover:text-white text-xs">✕ Close</button>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Every row you create is tied to your account id. The database (Supabase Postgres) only returns and changes rows whose owner is the signed-in user. The same rule is written for documents, summaries, comments, review progress and ratings, and the same folder rule protects uploaded files. This is the rule for documents:
            </p>
            <pre className="bg-slate-950 p-4 rounded-xl text-[11px] font-mono text-emerald-400 border border-slate-800 overflow-x-auto">
{`alter table public.documents enable row level security;

create policy "documents: read own" on public.documents
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "documents: update own" on public.documents
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));`}
            </pre>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              To write a summary, the text of your document is sent to an AI service (Groq). Do not summarise material you are not allowed to share with a third party.
            </p>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowRlsModal(false)}
                className="px-4 py-2 bg-emerald-500 text-slate-950 font-bold text-xs rounded-full"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
