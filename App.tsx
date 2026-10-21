/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Utensils,
  Layers,
  SplitSquareVertical,
  Network,
  Sun,
  Moon,
  Keyboard,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import { SimulationEngine } from './engine/simulationEngine';
import { AlgorithmMode, SimulationConfig } from './types/simulation';
import { TableSVG } from './components/TableSVG';
import { ControlPanel } from './components/ControlPanel';
import { StatusPanel } from './components/StatusPanel';
import { EventLog } from './components/EventLog';
import { MetricsCharts } from './components/MetricsCharts';
import { DeadlockBanner } from './components/DeadlockBanner';
import { PseudocodePanel } from './components/PseudocodePanel';
import { RealLifeMappingModal } from './components/RealLifeMappingModal';
import { CompareView } from './components/CompareView';

export default function App() {
  // Navigation tab
  const [activeTab, setActiveTab] = useState<'simulator' | 'compare'>('simulator');

  // Theme toggle
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);

  // Real-world mapping overlay & modal
  const [showRealLife, setShowRealLife] = useState<boolean>(false);
  const [isRealLifeModalOpen, setIsRealLifeModalOpen] = useState<boolean>(false);
  const [isKeyboardHelpOpen, setIsKeyboardHelpOpen] = useState<boolean>(false);

  // Selected philosopher for focused analysis and live C pseudocode tracking
  const [selectedPhilosopherId, setSelectedPhilosopherId] = useState<number>(0);

  // Simulation Configuration
  const [config, setConfig] = useState<SimulationConfig>({
    numPhilosophers: 5,
    mode: 'naive',
    speed: 1.0,
    minThinkTime: 1.5,
    maxThinkTime: 3.5,
    minEatTime: 1.5,
    maxEatTime: 3.0,
    starvationThreshold: 10.0,
    seed: 42,
  });

  const [isRunning, setIsRunning] = useState<boolean>(false);

  // Engine instance reference
  const engineRef = useRef<SimulationEngine | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  // State tick trigger for re-rendering React UI
  const [, setTickCounter] = useState<number>(0);
  const triggerRender = useCallback(() => {
    setTickCounter((c) => c + 1);
  }, []);

  // Initialize or re-create simulation engine
  const initEngine = useCallback(
    (newConfig: SimulationConfig) => {
      engineRef.current = new SimulationEngine(newConfig);
      setSelectedPhilosopherId((prev) => Math.min(prev, newConfig.numPhilosophers - 1));
      triggerRender();
    },
    [triggerRender]
  );

  // First mount initialization
  useEffect(() => {
    initEngine(config);
  }, []);

  // Handle configuration changes
  const handleUpdateConfig = (partial: Partial<SimulationConfig>) => {
    const nextConfig = { ...config, ...partial };
    setConfig(nextConfig);

    if (
      partial.numPhilosophers !== undefined ||
      partial.mode !== undefined ||
      partial.seed !== undefined ||
      partial.minThinkTime !== undefined ||
      partial.maxThinkTime !== undefined ||
      partial.minEatTime !== undefined ||
      partial.maxEatTime !== undefined
    ) {
      // Reinitialize engine if core structural parameters changed
      initEngine(nextConfig);
      setIsRunning(false);
    } else if (engineRef.current) {
      // Runtime parameter updates (e.g. speed, starvationThreshold)
      engineRef.current.config.speed = nextConfig.speed;
      engineRef.current.config.starvationThreshold = nextConfig.starvationThreshold;
      triggerRender();
    }
  };

  // Main high-frequency simulation loop
  useEffect(() => {
    const loop = (timestamp: number) => {
      if (lastTimeRef.current === null) {
        lastTimeRef.current = timestamp;
      }
      const elapsedMs = timestamp - lastTimeRef.current;
      lastTimeRef.current = timestamp;

      if (isRunning && engineRef.current && !engineRef.current.deadlockInfo.isDeadlocked) {
        // Delta time scaled by simulation speed multiplier
        const dt = Math.min(0.15, (elapsedMs / 1000) * engineRef.current.config.speed);
        const continued = engineRef.current.tick(dt);
        if (!continued) {
          setIsRunning(false);
        }
        triggerRender();
      }

      animFrameIdRef.current = requestAnimationFrame(loop);
    };

    animFrameIdRef.current = requestAnimationFrame(loop);
    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
    };
  }, [isRunning, triggerRender]);

  // Controls Handlers
  const handleStart = () => {
    if (engineRef.current?.deadlockInfo.isDeadlocked) return;
    setIsRunning(true);
  };

  const handlePause = () => {
    setIsRunning(false);
  };

  const handleStep = () => {
    if (engineRef.current && !engineRef.current.deadlockInfo.isDeadlocked) {
      engineRef.current.tick(0.2);
      triggerRender();
    }
  };

  const handleReset = () => {
    setIsRunning(false);
    initEngine(config);
  };

  const handleForceDeadlock = () => {
    if (engineRef.current) {
      engineRef.current.forceDeadlock();
      setIsRunning(false);
      triggerRender();
    }
  };

  const handleBreakDeadlock = () => {
    if (engineRef.current) {
      engineRef.current.breakDeadlock(0);
      setIsRunning(true);
      triggerRender();
    }
  };

  const handleClearLogs = () => {
    if (engineRef.current) {
      engineRef.current.events = [];
      triggerRender();
    }
  };

  // Keyboard Shortcuts Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing inside an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsRunning((prev) => {
          if (engineRef.current?.deadlockInfo.isDeadlocked) return false;
          return !prev;
        });
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        handleStep();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleReset();
      } else if ((e.key === 'd' || e.key === 'D') && config.mode === 'naive') {
        e.preventDefault();
        handleForceDeadlock();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [config.mode]);

  const engine = engineRef.current;
  const selectedPhilosopher =
    engine && engine.philosophers[selectedPhilosopherId]
      ? engine.philosophers[selectedPhilosopherId]
      : engine?.philosophers[0];

  return (
    <div
      className={`min-h-screen transition-colors duration-300 ${
        isDarkMode
          ? 'bg-[#090d16] text-slate-100'
          : 'bg-slate-100 text-slate-900'
      }`}
    >
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Brand & Title */}
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-amber-500/20 to-orange-500/20 text-amber-400 rounded-xl border border-amber-500/30">
              <Utensils className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white tracking-tight">
                  Dining Philosophers Problem Simulator
                </h1>
                <span className="text-[10px] font-mono uppercase bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
                  OS Concurrency Lab
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Simulating synchronization, mutual exclusion, deadlock cycles & starvation
              </p>
            </div>
          </div>

          {/* Navigation Tabs & Actions */}
          <div className="flex items-center gap-2">
            {/* View Tab Switcher */}
            <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setActiveTab('simulator')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  activeTab === 'simulator'
                    ? 'bg-amber-500 text-slate-950 font-semibold shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Simulation Lab</span>
              </button>

              <button
                onClick={() => setActiveTab('compare')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  activeTab === 'compare'
                    ? 'bg-amber-500 text-slate-950 font-semibold shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <SplitSquareVertical className="w-3.5 h-3.5" />
                <span>Compare Modes</span>
              </button>
            </div>

            {/* Real-Life Mapping Trigger */}
            <button
              onClick={() => setIsRealLifeModalOpen(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                showRealLife
                  ? 'bg-indigo-600/30 border-indigo-500/60 text-indigo-300'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
              title="View how dining philosophers maps to threads, mutexes, and database row locks"
            >
              <Network className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden md:inline">Real-Life Meaning</span>
            </button>

            {/* Keyboard Shortcuts Dialog */}
            <button
              onClick={() => setIsKeyboardHelpOpen(true)}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              title="Keyboard shortcuts"
            >
              <Keyboard className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Body Content */}
      <main className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
        {activeTab === 'simulator' ? (
          <>
            {/* Deadlock Alert Banner */}
            {engine && (
              <DeadlockBanner
                deadlockInfo={engine.deadlockInfo}
                onBreakDeadlock={handleBreakDeadlock}
                onReset={handleReset}
              />
            )}

            {/* Main Stage Grid: Left Controls, Center Table, Right Status */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Left Column: Controls (4 cols) */}
              <div className="lg:col-span-4 space-y-5">
                {engine && (
                  <ControlPanel
                    config={config}
                    isRunning={isRunning}
                    isDeadlocked={engine.deadlockInfo.isDeadlocked}
                    onUpdateConfig={handleUpdateConfig}
                    onStart={handleStart}
                    onPause={handlePause}
                    onStep={handleStep}
                    onReset={handleReset}
                    onForceDeadlock={handleForceDeadlock}
                  />
                )}
              </div>

              {/* Center & Right Column: Dining Table & Live Status (8 cols) */}
              <div className="lg:col-span-8 flex flex-col gap-5">
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-center">
                  {/* Center: The Dining Table (7 cols on xl) */}
                  <div className="xl:col-span-7 bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xl backdrop-blur flex flex-col items-center justify-center min-h-[460px]">
                    <div className="w-full flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-xs text-slate-400">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-200">Interactive Table Canvas</span>
                        <span className="text-[10px] text-slate-500">(Click philosopher to inspect)</span>
                      </div>
                      <span className="font-mono text-cyan-400">
                        t = {engine ? engine.simTime.toFixed(1) : '0.0'}s
                      </span>
                    </div>

                    {engine && (
                      <TableSVG
                        philosophers={engine.philosophers}
                        chopsticks={engine.chopsticks}
                        deadlockInfo={engine.deadlockInfo}
                        selectedPhilosopherId={selectedPhilosopherId}
                        onSelectPhilosopher={(id) => setSelectedPhilosopherId(id)}
                        showRealLife={showRealLife}
                        starvationThreshold={config.starvationThreshold}
                      />
                    )}
                  </div>

                  {/* Right Column: Live Status & Primitives (5 cols on xl) */}
                  <div className="xl:col-span-5">
                    {engine && (
                      <StatusPanel
                        philosophers={engine.philosophers}
                        chopsticks={engine.chopsticks}
                        mode={config.mode}
                        semaphoreState={engine.semaphoreState}
                        monitorState={engine.monitorState}
                        selectedPhilosopherId={selectedPhilosopherId}
                        onSelectPhilosopher={(id) => setSelectedPhilosopherId(id)}
                        showRealLife={showRealLife}
                        starvationThreshold={config.starvationThreshold}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Row: Event Log (Left) & Metrics Charts (Right) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
              {engine && (
                <EventLog
                  events={engine.events}
                  numPhilosophers={config.numPhilosophers}
                  onClear={handleClearLogs}
                />
              )}

              {engine && (
                <MetricsCharts
                  philosophers={engine.philosophers}
                  metrics={engine.getMetrics()}
                  showRealLife={showRealLife}
                />
              )}
            </div>

            {/* Collapsible How It Works & C Pseudocode Panel */}
            {selectedPhilosopher && (
              <PseudocodePanel
                mode={config.mode}
                selectedPhilosopher={selectedPhilosopher}
                numPhilosophers={config.numPhilosophers}
              />
            )}
          </>
        ) : (
          /* Compare Mode View */
          <CompareView
            baseSeed={config.seed}
            numPhilosophers={config.numPhilosophers}
          />
        )}
      </main>

      {/* Real-Life Mapping Modal */}
      <RealLifeMappingModal
        isOpen={isRealLifeModalOpen}
        onClose={() => setIsRealLifeModalOpen(false)}
        showRealLife={showRealLife}
        onToggleRealLife={(enabled) => setShowRealLife(enabled)}
      />

      {/* Keyboard Shortcuts Help Modal */}
      {isKeyboardHelpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-sm w-full p-5 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Keyboard className="w-4 h-4 text-amber-400" />
                Keyboard Hotkeys
              </h3>
              <button
                onClick={() => setIsKeyboardHelpOpen(false)}
                className="text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2.5 py-4 text-xs font-mono">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-sans">Toggle Play / Pause</span>
                <kbd className="bg-slate-800 px-2 py-1 rounded border border-slate-700 text-slate-200">
                  Space
                </kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-sans">Step (+0.2s)</span>
                <kbd className="bg-slate-800 px-2 py-1 rounded border border-slate-700 text-slate-200">
                  S
                </kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-sans">Reset Simulation</span>
                <kbd className="bg-slate-800 px-2 py-1 rounded border border-slate-700 text-slate-200">
                  R
                </kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-sans">Force Deadlock (Naive)</span>
                <kbd className="bg-slate-800 px-2 py-1 rounded border border-slate-700 text-slate-200">
                  D
                </kbd>
              </div>
            </div>
            <button
              onClick={() => setIsKeyboardHelpOpen(false)}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-medium cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
