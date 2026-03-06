"use client";

import { useAuth } from "@/providers/auth-provider";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  ArrowRight,
  BarChart3,
  MessageCircle,
  Shield,
  TrendingUp,
  TrendingDown,
  PieChart,
  Sparkles,
  Search,
  FileText,
  Zap,
  Lock,
  Globe,
  Newspaper,
  Activity,
  Brain,
  Target,
  AlertCircle,
  ChevronRight,
  Bot,
  User,
  DollarSign,
  Building2,
  Landmark,
  Plane,
} from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

// Chat Bubble Component
function ChatBubble({
  type,
  message,
  delay = 0,
  className = "",
}: {
  type: "user" | "ai";
  message: string;
  delay?: number;
  className?: string;
}) {
  const bubbleRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!bubbleRef.current) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        bubbleRef.current,
        { opacity: 0, y: 30, scale: 0.9 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.6,
          delay,
          ease: "back.out(1.7)",
          force3D: true,
          scrollTrigger: {
            trigger: bubbleRef.current,
            start: "top 90%",
            once: true,
          },
        }
      );
    }, bubbleRef);

    return () => ctx.revert();
  }, [delay]);

  return (
    <div
      ref={bubbleRef}
      className={`flex items-start gap-3 ${type === "user" ? "flex-row-reverse" : ""} ${className}`}
    >
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
          type === "ai" ? "bg-minto-accent" : "bg-minto-text/10"
        }`}
      >
        {type === "ai" ? (
          <Bot size={20} className="text-white" />
        ) : (
          <User size={20} className="text-minto-text" />
        )}
      </div>
      <div
        className={`max-w-[320px] px-5 py-4 rounded-2xl text-base leading-relaxed ${
          type === "ai"
            ? "glass-elevated text-minto-text rounded-tl-sm"
            : "bg-minto-text text-white rounded-tr-sm"
        }`}
      >
        {message}
      </div>
    </div>
  );
}

// Portfolio Card
function PortfolioCard({
  name,
  value,
  change,
  changePercent,
  delay = 0,
}: {
  name: string;
  value: string;
  change: string;
  changePercent: string;
  delay?: number;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!cardRef.current) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        cardRef.current,
        { opacity: 0, x: -40 },
        {
          opacity: 1,
          x: 0,
          duration: 0.7,
          delay,
          ease: "power3.out",
          force3D: true,
          scrollTrigger: {
            trigger: cardRef.current,
            start: "top 90%",
            once: true,
          },
        }
      );
    }, cardRef);

    return () => ctx.revert();
  }, [delay]);

  const isPositive = !change.startsWith("-");

  return (
    <div ref={cardRef} className="glass-elevated p-5 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-minto-accent/10 flex items-center justify-center">
          <span className="text-minto-accent font-bold text-sm">{name.slice(0, 2).toUpperCase()}</span>
        </div>
        <div>
          <p className="font-semibold text-minto-text">{name}</p>
          <p className="text-sm text-minto-text-muted">{value}</p>
        </div>
      </div>
      <div className="text-right">
        <p className={`font-semibold ${isPositive ? "text-minto-positive" : "text-minto-negative"}`}>
          {change}
        </p>
        <p className="text-sm text-minto-text-muted">{changePercent}</p>
      </div>
    </div>
  );
}

// News Card
function NewsCard({
  headline,
  impact,
  delay = 0,
  className = "",
}: {
  headline: string;
  impact: "positive" | "negative" | "neutral";
  delay?: number;
  className?: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!cardRef.current) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        cardRef.current,
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          duration: 0.5,
          delay,
          ease: "power2.out",
          force3D: true,
          scrollTrigger: {
            trigger: cardRef.current,
            start: "top 90%",
            once: true,
          },
        }
      );
    }, cardRef);

    return () => ctx.revert();
  }, [delay]);

  const impactColors = {
    positive: "bg-minto-positive/20 text-minto-positive border-minto-positive/30",
    negative: "bg-minto-negative/20 text-minto-negative border-minto-negative/30",
    neutral: "bg-minto-text-muted/20 text-minto-text-secondary border-minto-text-muted/30",
  };

  const impactLabels = {
    positive: "Portfolio +ve",
    negative: "Portfolio -ve", 
    neutral: "Watch",
  };

  return (
    <div ref={cardRef} className={`glass-card p-4 flex items-start gap-3 ${className}`}>
      <div className="w-10 h-10 rounded-lg bg-minto-accent/10 flex items-center justify-center flex-shrink-0">
        <Newspaper size={18} className="text-minto-accent" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-minto-text leading-snug mb-2">{headline}</p>
        <span className={`inline-block text-xs px-2 py-1 rounded-full border ${impactColors[impact]}`}>
          {impactLabels[impact]}
        </span>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { session, loading } = useAuth();
  const router = useRouter();
  
  // Refs for animations
  const heroRef = useRef<HTMLDivElement>(null);
  const heroTextRef = useRef<HTMLDivElement>(null);
  const macoRef = useRef<HTMLDivElement>(null);
  const pinnedSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && session) {
      router.replace("/chat");
    }
  }, [session, loading, router]);

  // Hero entrance animation
  useLayoutEffect(() => {
    if (!heroRef.current || loading || session) return;

    const ctx = gsap.context(() => {
      // Logo pulse
      gsap.fromTo(
        ".hero-logo",
        { scale: 0, rotation: -180 },
        { scale: 1, rotation: 0, duration: 1, ease: "back.out(1.7)", delay: 0.2 }
      );

      // Big text reveal
      gsap.fromTo(
        ".hero-line",
        { y: 100, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 1,
          stagger: 0.15,
          ease: "power4.out",
          delay: 0.5,
        }
      );

      // Subtext
      gsap.fromTo(
        ".hero-sub",
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8, delay: 1, ease: "power2.out" }
      );

      // CTA
      gsap.fromTo(
        ".hero-cta",
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6, delay: 1.3, ease: "power2.out" }
      );
    }, heroRef);

    return () => ctx.revert();
  }, [loading, session]);

  // Pinned scroll section for macro events
  useLayoutEffect(() => {
    if (!macoRef.current || loading || session) return;

    let tl: gsap.core.Timeline | undefined;

    const ctx = gsap.context(() => {
      tl = gsap.timeline({
        scrollTrigger: {
          trigger: macoRef.current,
          start: "top top",
          end: "+=200%",
          pin: true,
          scrub: 0.8,
          anticipatePin: 1,
          fastScrollEnd: true,
          invalidateOnRefresh: true,
          onLeaveBack: () => {
            gsap.set([".macro-title", ".macro-card", ".macro-insight"], { clearProps: "transform,opacity" });
          },
        },
      });

      tl.fromTo(
        ".macro-title",
        { opacity: 0, y: 50 },
        { opacity: 1, y: 0, duration: 0.3, force3D: true }
      )
        .fromTo(
          ".macro-card",
          { opacity: 0, x: 100 },
          { opacity: 1, x: 0, stagger: 0.1, duration: 0.3, force3D: true },
          "-=0.1"
        )
        .fromTo(
          ".macro-insight",
          { opacity: 0, y: 30 },
          { opacity: 1, y: 0, duration: 0.3, force3D: true },
          "-=0.1"
        );

    }, macoRef);

    return () => {
      tl?.scrollTrigger?.kill();
      tl?.kill();
      ctx.revert();
    };
  }, [loading, session]);

  // Horizontal scroll for features
  useLayoutEffect(() => {
    if (!pinnedSectionRef.current || loading || session) return;

    let tween: gsap.core.Tween | undefined;

    const ctx = gsap.context(() => {
      const track = pinnedSectionRef.current?.querySelector<HTMLElement>(".h-scroll-track");
      const cards = gsap.utils.toArray<HTMLElement>(".h-scroll-card");
      if (!track || cards.length < 2) return;

      const getDistance = () => {
        const viewportWidth = pinnedSectionRef.current?.offsetWidth ?? window.innerWidth;
        return Math.max(0, track.scrollWidth - viewportWidth);
      };

      tween = gsap.to(track, {
        x: () => -getDistance(),
        ease: "none",
        force3D: true,
        scrollTrigger: {
          trigger: pinnedSectionRef.current,
          start: "top top",
          end: () => `+=${getDistance()}`,
          pin: true,
          scrub: 0.8,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          fastScrollEnd: true,
          snap: {
            snapTo: cards.length > 1 ? 1 / (cards.length - 1) : 1,
            duration: 0.2,
            ease: "power1.inOut",
          },
          onLeaveBack: () => {
            gsap.set(track, { clearProps: "transform" });
          },
        },
      });

    }, pinnedSectionRef);

    return () => {
      tween?.scrollTrigger?.kill();
      tween?.kill();
      ctx.revert();
    };
  }, [loading, session]);

  if (loading || session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-minto-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="landing-page min-h-screen overflow-x-hidden">
      {/* Fixed Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-4 mix-blend-difference">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/minto.png" alt="Minto" width={32} height={32} className="invert" />
            <span className="text-lg font-bold text-white">Minto</span>
          </div>
          <Link
            href="/login"
            className="bg-white text-minto-text px-5 py-2 rounded-full text-sm font-semibold hover:bg-white/90 transition-colors"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* HERO SECTION - Massive Typography */}
      <section ref={heroRef} className="min-h-screen flex flex-col items-center justify-center px-6 relative">
        <div className="max-w-7xl mx-auto text-center">
          {/* Floating Logo */}
          <div className="hero-logo inline-block mb-12">
            <div className="glass-elevated p-5 rounded-3xl">
              <Image src="/minto.png" alt="Minto" width={100} height={100} />
            </div>
          </div>

          {/* Massive Headline */}
          <div ref={heroTextRef} className="overflow-hidden mb-8">
            <div className="hero-line text-6xl sm:text-8xl md:text-9xl font-black text-minto-text leading-none tracking-tighter">
              YOUR MONEY.
            </div>
          </div>
          <div className="overflow-hidden mb-12">
            <div className="hero-line text-6xl sm:text-8xl md:text-9xl font-black leading-none tracking-tighter">
              <span className="text-minto-accent">UNDERSTOOD.</span>
            </div>
          </div>

          {/* Subtext */}
          <p className="hero-sub text-xl md:text-2xl text-minto-text-secondary max-w-2xl mx-auto mb-12 leading-relaxed">
            Track your Indian portfolio. Chat with AI. Know how world events affect your wealth.
          </p>

          {/* CTA */}
          <div className="hero-cta">
            <Link
              href="/login"
              className="inline-flex items-center gap-3 bg-minto-accent text-white px-10 py-5 rounded-full text-lg font-semibold hover:opacity-90 transition-all hover:scale-105 group"
            >
              Start Your Journey
              <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-minto-text-muted text-sm uppercase tracking-widest animate-pulse">
          Scroll
        </div>
      </section>

      {/* SECTION 2: The Problem - Big Asymmetric Layout */}
      <section className="landing-section min-h-screen py-32 px-6 relative overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="landing-grid grid gap-10 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,28rem)] items-center">
            {/* Left: Massive text */}
            <div className="max-w-3xl">
              <h2 className="text-5xl md:text-7xl font-black text-minto-text leading-tight mb-8">
                Your portfolio is connected to{" "}
                <span className="text-minto-accent">everything.</span>
              </h2>
              <p className="text-xl text-minto-text-secondary leading-relaxed max-w-xl">
                Fed rate decisions. Geopolitical tensions. Oil prices. Election results. 
                Your SIPs and stocks don't exist in a vacuum.
              </p>
            </div>

            {/* Right: Floating stat cards */}
            <div className="space-y-4 xl:justify-self-end xl:w-full xl:max-w-md">
              <div className="glass-elevated p-6 rounded-2xl transform rotate-2 hover:rotate-0 transition-transform">
                <div className="flex items-center gap-3 mb-3">
                  <Globe className="text-minto-accent" size={24} />
                  <span className="text-sm font-medium text-minto-text-muted uppercase tracking-wider">Global Impact</span>
                </div>
                <p className="text-3xl font-bold text-minto-text">US Fed ↗ 0.25%</p>
                <p className="text-sm text-minto-text-secondary mt-2">FII outflows expected. Your IT stocks may dip.</p>
              </div>

              <div className="glass-elevated p-6 rounded-2xl transform -rotate-1 hover:rotate-0 transition-transform">
                <div className="flex items-center gap-3 mb-3">
                  <Landmark className="text-minto-accent" size={24} />
                  <span className="text-sm font-medium text-minto-text-muted uppercase tracking-wider">Policy</span>
                </div>
                <p className="text-3xl font-bold text-minto-text">Budget 2024</p>
                <p className="text-sm text-minto-text-secondary mt-2">LTCG changes affect your equity MF taxation.</p>
              </div>

              <div className="glass-elevated p-6 rounded-2xl transform rotate-1 hover:rotate-0 transition-transform">
                <div className="flex items-center gap-3 mb-3">
                  <Building2 className="text-minto-accent" size={24} />
                  <span className="text-sm font-medium text-minto-text-muted uppercase tracking-wider">Sector</span>
                </div>
                <p className="text-3xl font-bold text-minto-text">Banking Rally</p>
                <p className="text-sm text-minto-text-secondary mt-2">Credit growth ↑. Your HDFC & ICICI exposure up 4%.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: Macro Events - Pinned Scrollytelling */}
      <section ref={macoRef} className="landing-dark-section min-h-screen relative text-white overflow-hidden">
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 2px 2px, rgba(255,255,255,0.14) 1px, transparent 0)`,
            backgroundSize: "40px 40px"
          }} />
        </div>

        <div className="h-screen flex items-center px-6 md:px-12">
          <div className="max-w-7xl mx-auto w-full grid xl:grid-cols-[minmax(0,1fr)_minmax(22rem,26rem)] gap-12 items-center">
            {/* Left: Fixed content */}
            <div className="macro-title landing-pinned-panel max-w-2xl">
              <div className="inline-flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full mb-6 border border-white/12">
                <Newspaper size={16} />
                <span className="text-sm font-medium">Macro Intelligence</span>
              </div>
              <h2 className="text-4xl md:text-6xl font-black leading-tight mb-6">
                World news meets your portfolio.
              </h2>
              <p className="text-lg text-white/70 leading-relaxed mb-8">
                Minto reads thousands of news sources and connects global events to your specific holdings. 
                We explain the "so what" for your money.
              </p>
              
              <div className="macro-insight landing-dark-glass p-5 rounded-xl">
                <div className="flex items-start gap-3">
                  <Brain className="text-minto-accent flex-shrink-0" size={24} />
                  <div>
                    <p className="font-semibold mb-1">AI-Powered Context</p>
                    <p className="text-sm text-white/60">
                      "Oil prices surged 12% this week. Your portfolio has 8% exposure to energy stocks via Reliance and Nifty 50 index funds. 
                      This could add ₹18,000 to your portfolio value."
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Scrolling news cards */}
            <div className="space-y-4 max-w-md xl:justify-self-end">
              <NewsCard 
                headline="RBI holds repo rate at 6.5%. Your debt MF yields stable."
                impact="neutral"
                delay={0}
                className="macro-card"
              />
              <NewsCard 
                headline="India-ME trade corridor announced. Shipping & logistics stocks rally."
                impact="positive"
                delay={0.1}
                className="macro-card"
              />
              <NewsCard 
                headline="Tech selloff in US markets. Indian IT sector facing headwinds."
                impact="negative"
                delay={0.2}
                className="macro-card"
              />
              <NewsCard 
                headline="Auto sales hit record high. Your Maruti & Tata Motors holdings up."
                impact="positive"
                delay={0.3}
                className="macro-card"
              />
              <NewsCard 
                headline="Rupee depreciates vs Dollar. Export-oriented sectors benefit."
                impact="positive"
                delay={0.4}
                className="macro-card"
              />
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4: Chat Demo - Full Width Immersive */}
      <section className="landing-section min-h-screen py-32 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-5xl md:text-7xl font-black text-minto-text mb-6">
              Just ask.
            </h2>
            <p className="text-xl text-minto-text-secondary max-w-2xl mx-auto">
              No jargon. No complex charts to decode. Just conversation.
            </p>
          </div>

          {/* Chat Interface Mockup */}
          <div className="max-w-3xl mx-auto glass-elevated rounded-3xl overflow-hidden">
            {/* Chat Header */}
            <div className="bg-minto-accent px-6 py-4 flex items-center gap-3">
              <Bot size={24} className="text-white" />
              <span className="font-semibold text-white">Minto</span>
              <span className="ml-auto text-xs text-white/70 bg-white/20 px-2 py-1 rounded-full">
                Online
              </span>
            </div>

            {/* Chat Messages */}
            <div className="p-6 space-y-6 bg-gradient-to-b from-transparent to-white/5">
              <ChatBubble 
                type="user" 
                message="How did the budget affect my taxes?" 
                delay={0}
              />
              <ChatBubble 
                type="ai" 
                message="Based on your ₹15L annual equity MF investments, the new LTCG rules mean you'll pay ~₹22,500 more tax if you sell after holding 1 year. But your smallcap exposure (35%) benefits from the revised indexation removal exemption."
                delay={0.3}
              />
              <ChatBubble 
                type="user" 
                message="Should I rebalance?" 
                delay={0.6}
              />
              <ChatBubble 
                type="ai" 
                message="Your smallcap allocation is at 35% vs your target of 25%. Given current valuations and the tax changes, consider booking some profits. I can suggest a rebalancing plan."
                delay={0.9}
              />
            </div>

            {/* Chat Input */}
            <div className="p-4 border-t border-minto-text-muted/10">
              <div className="glass-subtle px-5 py-4 rounded-xl flex items-center gap-3">
                <span className="text-minto-text-muted flex-1">Type a message...</span>
                <div className="w-8 h-8 bg-minto-accent rounded-full flex items-center justify-center">
                  <ArrowRight size={16} className="text-white" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 5: Portfolio Demo - Split Screen */}
      <section className="landing-section min-h-screen py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid xl:grid-cols-[minmax(22rem,1fr)_minmax(0,0.92fr)] gap-16 items-center">
            {/* Left: Portfolio Cards */}
            <div className="space-y-4 order-2 md:order-1">
              <div className="glass-elevated p-6 rounded-2xl mb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-minto-text-muted uppercase tracking-wider">Total Value</p>
                    <p className="text-4xl font-black text-minto-text">₹42,85,000</p>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center gap-1 text-minto-positive font-bold bg-minto-positive/10 px-4 py-2 rounded-full">
                      <TrendingUp size={18} /> +12.4%
                    </span>
                  </div>
                </div>
              </div>

              <PortfolioCard name="Reliance Industries" value="₹5,42,000" change="+₹18,400" changePercent="+3.5%" delay={0} />
              <PortfolioCard name="HDFC Bank" value="₹4,85,000" change="+₹12,200" changePercent="+2.6%" delay={0.1} />
              <PortfolioCard name="Nifty 50 Index Fund" value="₹6,20,000" change="+₹22,600" changePercent="+3.8%" delay={0.2} />
              <PortfolioCard name="SBI Small Cap Fund" value="₹3,45,000" change="+₹15,800" changePercent="+4.8%" delay={0.3} />
              <PortfolioCard name="Tata Motors" value="₹2,15,000" change="-₹4,200" changePercent="-1.9%" delay={0.4} />
            </div>

            {/* Right: Text Content */}
            <div className="order-1 md:order-2">
              <div className="inline-flex items-center gap-2 glass-card px-4 py-2 rounded-full mb-6">
                <PieChart size={16} className="text-minto-accent" />
                <span className="text-sm font-medium">Unified Portfolio</span>
              </div>
              <h2 className="text-5xl md:text-6xl font-black text-minto-text leading-tight mb-6">
                Everything. In one place.
              </h2>
              <p className="text-xl text-minto-text-secondary leading-relaxed mb-8">
                Stocks from Zerodha. MFs from your CAS. ETFs from manual entries. 
                See the complete picture of your wealth.
              </p>
              
              <div className="flex flex-wrap gap-3">
                {[
                  { icon: Zap, text: "Real-time prices" },
                  { icon: FileText, text: "CAS PDF import" },
                  { icon: Lock, text: "Bank-grade security" },
                ].map(({ icon: Icon, text }) => (
                  <span key={text} className="glass-card px-4 py-2 rounded-full flex items-center gap-2 text-sm text-minto-text">
                    <Icon size={16} className="text-minto-accent" />
                    {text}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 6: Horizontal Scroll Features */}
      <section ref={pinnedSectionRef} className="landing-section min-h-screen relative overflow-hidden">
        <div className="h-screen flex items-center">
          <div className="h-scroll-track flex items-stretch gap-6 xl:gap-8 pl-6 md:pl-10 xl:pl-16 pr-[12vw] md:pr-[18vw] xl:pr-[24vw]">
            {/* Intro Card */}
            <div className="h-scroll-card landing-feature-card min-w-[min(88vw,26rem)] md:min-w-[30rem] xl:min-w-[34rem] flex flex-col justify-center pr-2">
              <h2 className="text-5xl md:text-6xl font-black text-minto-text leading-tight mb-6">
                Built for Indian investors.
              </h2>
              <p className="text-xl text-minto-text-secondary">
                Scroll to explore features →
              </p>
            </div>

            {/* Feature Cards */}
            <div className="h-scroll-card landing-feature-card min-w-[min(84vw,23rem)] xl:min-w-[24rem] glass-elevated p-8 rounded-3xl flex flex-col">
              <div className="w-16 h-16 rounded-2xl bg-minto-accent/10 flex items-center justify-center mb-6">
                <BarChart3 size={32} className="text-minto-accent" />
              </div>
              <h3 className="text-2xl font-bold text-minto-text mb-3">Smart Analytics</h3>
              <p className="text-minto-text-secondary leading-relaxed">
                Sector splits. Market cap distribution. Risk concentration flags. Understand what you own.
              </p>
            </div>

            <div className="h-scroll-card landing-feature-card min-w-[min(84vw,23rem)] xl:min-w-[24rem] glass-elevated p-8 rounded-3xl flex flex-col">
              <div className="w-16 h-16 rounded-2xl bg-minto-accent/10 flex items-center justify-center mb-6">
                <Target size={32} className="text-minto-accent" />
              </div>
              <h3 className="text-2xl font-bold text-minto-text mb-3">Goal Tracking</h3>
              <p className="text-minto-text-secondary leading-relaxed">
                Map your portfolio to life goals. Retirement. Education. Home. Track progress visually.
              </p>
            </div>

            <div className="h-scroll-card landing-feature-card min-w-[min(84vw,23rem)] xl:min-w-[24rem] glass-elevated p-8 rounded-3xl flex flex-col">
              <div className="w-16 h-16 rounded-2xl bg-minto-accent/10 flex items-center justify-center mb-6">
                <AlertCircle size={32} className="text-minto-accent" />
              </div>
              <h3 className="text-2xl font-bold text-minto-text mb-3">Risk Alerts</h3>
              <p className="text-minto-text-secondary leading-relaxed">
                Get warned when concentration exceeds your thresholds. No more overexposure surprises.
              </p>
            </div>

            <div className="h-scroll-card landing-feature-card min-w-[min(84vw,23rem)] xl:min-w-[24rem] glass-elevated p-8 rounded-3xl flex flex-col">
              <div className="w-16 h-16 rounded-2xl bg-minto-accent/10 flex items-center justify-center mb-6">
                <Search size={32} className="text-minto-accent" />
              </div>
              <h3 className="text-2xl font-bold text-minto-text mb-3">Market Search</h3>
              <p className="text-minto-text-secondary leading-relaxed">
                Look up any Indian stock or mutual fund. Real-time prices, historical charts, news.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 7: Final CTA - Full Bleed */}
      <section className="landing-section min-h-[80vh] flex items-center justify-center px-6 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-minto-accent/5 rounded-full blur-3xl" />
          <div className="absolute -bottom-1/2 -left-1/2 w-full h-full bg-minto-accent/5 rounded-full blur-3xl" />
        </div>

        <div className="relative text-center max-w-4xl mx-auto">
          <div className="glass-elevated p-6 rounded-3xl inline-block mb-10 shadow-[0_24px_80px_rgba(45,58,46,0.12)]">
            <Image src="/minto.png" alt="Minto" width={80} height={80} />
          </div>
          <h2 className="text-5xl md:text-7xl font-black text-minto-text mb-6 leading-tight">
            Ready to understand{" "}
            <span className="text-minto-accent">your money?</span>
          </h2>
          <p className="text-xl text-minto-text-secondary mb-12 max-w-2xl mx-auto">
            Join thousands of Indian investors who track, analyze, and chat about their portfolios with Minto.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 bg-minto-accent text-white px-10 py-5 rounded-full text-lg font-semibold hover:opacity-90 transition-all hover:scale-105"
            >
              Get Started Free <ChevronRight size={20} />
            </Link>
            <span className="text-sm text-minto-text-muted">
              No credit card required
            </span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-minto-text-muted/10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <Image src="/minto.png" alt="Minto" width={28} height={28} />
            <span className="font-bold text-minto-text text-lg">Minto</span>
          </div>
          <p className="text-sm text-minto-text-muted text-center">
            Minto provides informational insights, not investment advice. Past performance does not guarantee future results.
          </p>
          <div className="flex items-center gap-6 text-sm text-minto-text-muted">
            <span>© 2024</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
