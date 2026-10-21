/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, RotateCcw, FastForward, Info } from 'lucide-react';
import { BarberState, LogEntry } from './types';
import { BarberShopScene } from './components/BarberShopScene';
import { EventLog } from './components/EventLog';
import { StatusAndStats } from './components/StatusAndStats';

export default function App() {
  // Configuration inputs
  const [numChairs, setNumChairs] = useState<number>(3);
  const [numCustomers, setNumCustomers] = useState<number>(5);

  // Simulation lifecycle
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [hasStarted, setHasStarted] = useState<boolean>(false);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1); // 1x or 2x

  // Barber shop states
  const [barberState, setBarberState] = useState<BarberState>('Sleeping');
  const [waitingQueue, setWaitingQueue] = useState<number[]>([]);
  const [currentCustomerInChair, setCurrentCustomerInChair] = useState<number | null>(null);
  const [incomingCustomers, setIncomingCustomers] = useState<number[]>([]);
  const [servedCount, setServedCount] = useState<number>(0);
  const [leftCount, setLeftCount] = useState<number>(0);
  const [haircutProgress, setHaircutProgress] = useState<number>(0);
  const [mutexLocked, setMutexLocked] = useState<boolean>(false);

  // Animated walking customer
  const [walkingCustomer, setWalkingCustomer] = useState<{
    id: number;
    action: 'entering' | 'to_barber' | 'to_chair' | 'leaving_rejected' | 'leaving_done';
    chairIndex?: number;
  } | null>(null);

  // Event Log
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Simulation timers refs to allow clean cancellation on Reset
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const haircutIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Active state refs to avoid stale closure in recursive/timer simulation loop
  const stateRef = useRef({
    numChairs,
    numCustomers,
    barberState,
    waitingQueue,
    currentCustomerInChair,
    incomingCustomers,
    servedCount,
    leftCount,
    isRunning,
    speedMultiplier,
  });

  useEffect(() => {
    stateRef.current = {
      numChairs,
      numCustomers,
      barberState,
      waitingQueue,
      currentCustomerInChair,
      incomingCustomers,
      servedCount,
      leftCount,
      isRunning,
      speedMultiplier,
    };
  }, [
    numChairs,
    numCustomers,
    barberState,
    waitingQueue,
    currentCustomerInChair,
    incomingCustomers,
    servedCount,
    leftCount,
    isRunning,
    speedMultiplier,
  ]);

  // Format real clock time HH:MM:SS
  const getTimestamp = () => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  };

  // Add entry to Event Log
  const addLog = useCallback((message: string, color: LogEntry['color']) => {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random()}`,
      time: getTimestamp(),
      message,
      color,
    };
    setLogs((prev) => [...prev, entry]);
  }, []);

  const safeTimeout = useCallback((fn: () => void, ms: number) => {
    const adjustedMs = ms / stateRef.current.speedMultiplier;
    const timeout = setTimeout(fn, adjustedMs);
    timeoutsRef.current.push(timeout);
    return timeout;
  }, []);

  // Clear all pending timeouts
  const clearAllTimers = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    if (haircutIntervalRef.current) {
      clearInterval(haircutIntervalRef.current);
      haircutIntervalRef.current = null;
    }
  }, []);

  // Initialize initial incoming customers before simulation starts
  useEffect(() => {
    if (!hasStarted) {
      const initial = Array.from({ length: numCustomers }, (_, i) => i + 1);
      setIncomingCustomers(initial);
    }
  }, [numCustomers, hasStarted]);

  // ================= SIMULATION LOGIC =================
  // Step: Perform haircut for Customer X
  const performHaircut = useCallback((customerId: number) => {
    setCurrentCustomerInChair(customerId);
    setBarberState('Serving');
    setHaircutProgress(0);
    addLog(`Barber started serving Customer ${customerId}.`, 'blue');

    // Haircut duration: 10 - 14 seconds (random between 10000ms and 12500ms)
    const duration = (10000 + Math.random() * 2500) / stateRef.current.speedMultiplier;
    const intervalTick = 100;
    const totalTicks = duration / intervalTick;
    let currentTick = 0;

    if (haircutIntervalRef.current) {
      clearInterval(haircutIntervalRef.current);
    }

    haircutIntervalRef.current = setInterval(() => {
      currentTick++;
      const progress = Math.min(100, Math.round((currentTick / totalTicks) * 100));
      setHaircutProgress(progress);

      if (currentTick >= totalTicks) {
        if (haircutIntervalRef.current) {
          clearInterval(haircutIntervalRef.current);
          haircutIntervalRef.current = null;
        }
        finishHaircut(customerId);
      }
    }, intervalTick);
  }, [addLog]);

  // Step: Finish haircut, customer leaves, barber checks queue
  const finishHaircut = useCallback((customerId: number) => {
    addLog(`Haircut completed for Customer ${customerId}.`, 'green');
    setServedCount((prev) => prev + 1);
    setCurrentCustomerInChair(null);
    setHaircutProgress(0);

    // Customer leaves through door
    setWalkingCustomer({ id: customerId, action: 'leaving_done' });
    safeTimeout(() => {
      setWalkingCustomer(null);
    }, 1200);

    // Barber checks queue
    safeTimeout(() => {
      setBarberState('Checking Queue');
      setMutexLocked(true); // Mutex lock during queue inspection

      safeTimeout(() => {
        setMutexLocked(false);
        setWaitingQueue((currentQueue) => {
          if (currentQueue.length > 0) {
            // First in FIFO order gets served
            const nextCustomer = currentQueue[0];
            const remainingQueue = currentQueue.slice(1);

            // Animate customer walking to barber chair
            setWalkingCustomer({ id: nextCustomer, action: 'to_barber' });
            safeTimeout(() => {
              setWalkingCustomer(null);
              performHaircut(nextCustomer);
            }, 800);

            return remainingQueue;
          } else {
            // No waiting customers: barber goes to sleep
            setBarberState('Sleeping');
            addLog('Barber is sleeping (no customers).', 'yellow');

            // Check if all customers processed
            checkCompletion();
            return currentQueue;
          }
        });
      }, 1000); // 1s checking queue inspection
    }, 500);
  }, [addLog, performHaircut, safeTimeout]);

  // Step: Handle Customer Arrival at shop
  const handleCustomerArrival = useCallback((customerId: number) => {
    setMutexLocked(true); // Acquiring mutex to check shop state

    // Animate customer entering door
    setWalkingCustomer({ id: customerId, action: 'entering' });

    safeTimeout(() => {
      const currentBarber = stateRef.current.barberState;
      const currentQueue = stateRef.current.waitingQueue;
      const maxChairs = stateRef.current.numChairs;

      if (currentBarber === 'Sleeping') {
        // Condition 1: Barber is sleeping -> customer wakes him up and gets served directly
        setMutexLocked(false);
        addLog(`Customer ${customerId} woke up the barber.`, 'yellow');
        setWalkingCustomer({ id: customerId, action: 'to_barber' });

        safeTimeout(() => {
          setWalkingCustomer(null);
          performHaircut(customerId);
        }, 800);
      } else if (currentQueue.length < maxChairs) {
        // Condition 2: Barber is busy but waiting chair is free
        setMutexLocked(false);
        const targetChairIdx = currentQueue.length;
        setWalkingCustomer({ id: customerId, action: 'to_chair', chairIndex: targetChairIdx });
        addLog(`Customer ${customerId} arrived and is waiting.`, 'grey');

        safeTimeout(() => {
          setWalkingCustomer(null);
          setWaitingQueue((prev) => [...prev, customerId]);
        }, 800);
      } else {
        // Condition 3: All chairs are full -> customer leaves
        setMutexLocked(false);
        addLog(`Customer ${customerId} left (no free chairs).`, 'red');
        setWalkingCustomer({ id: customerId, action: 'leaving_rejected' });
        setLeftCount((prev) => prev + 1);

        safeTimeout(() => {
          setWalkingCustomer(null);
          checkCompletion();
        }, 1200);
      }
    }, 700);
  }, [addLog, performHaircut, safeTimeout]);

  // Check if simulation is completely finished
  const checkCompletion = useCallback(() => {
    safeTimeout(() => {
      const { servedCount, leftCount, numCustomers, incomingCustomers, waitingQueue, currentCustomerInChair } = stateRef.current;
      if (
        incomingCustomers.length === 0 &&
        waitingQueue.length === 0 &&
        currentCustomerInChair === null &&
        servedCount + leftCount >= numCustomers
      ) {
        setIsRunning(false);
        addLog(
          `Simulation Completed - All ${numCustomers} customers processed. (${servedCount} served, ${leftCount} left).`,
          'green'
        );
      }
    }, 800);
  }, [addLog, safeTimeout]);

  // Trigger customer arrival sequence with 2-4 seconds interval
  const scheduleNextArrival = useCallback((remaining: number[]) => {
    if (remaining.length === 0) return;

    // 2-4 seconds random interval
    const interval = 2200 + Math.random() * 1800;

    safeTimeout(() => {
      if (!stateRef.current.isRunning) return;

      const nextCustomer = remaining[0];
      const rest = remaining.slice(1);
      setIncomingCustomers(rest);

      handleCustomerArrival(nextCustomer);

      if (rest.length > 0) {
        scheduleNextArrival(rest);
      }
    }, interval);
  }, [handleCustomerArrival, safeTimeout]);

  // START SIMULATION
  const handleStartSimulation = () => {
    if (isRunning) return;

    setIsRunning(true);
    setHasStarted(true);
    setBarberState('Sleeping');
    setHaircutProgress(0);
    setWaitingQueue([]);
    setCurrentCustomerInChair(null);
    setServedCount(0);
    setLeftCount(0);

    const initialCustomers = Array.from({ length: numCustomers }, (_, i) => i + 1);
    setIncomingCustomers(initialCustomers);

    addLog(`Simulation started with ${numChairs} waiting chairs and ${numCustomers} customers.`, 'blue');
    addLog('Barber is sleeping (no customers).', 'yellow');

    // First arrival after a brief initial pause (1.2s)
    safeTimeout(() => {
      if (initialCustomers.length > 0) {
        const first = initialCustomers[0];
        const rest = initialCustomers.slice(1);
        setIncomingCustomers(rest);
        handleCustomerArrival(first);

        if (rest.length > 0) {
          scheduleNextArrival(rest);
        }
      }
    }, 1200);
  };

  // RESET SIMULATION
  const handleReset = () => {
    clearAllTimers();
    setIsRunning(false);
    setHasStarted(false);
    setBarberState('Sleeping');
    setWaitingQueue([]);
    setCurrentCustomerInChair(null);
    setWalkingCustomer(null);
    setServedCount(0);
    setLeftCount(0);
    setHaircutProgress(0);
    setMutexLocked(false);
    setLogs([]);

    const initial = Array.from({ length: numCustomers }, (_, i) => i + 1);
    setIncomingCustomers(initial);
  };

  return (
    <div className="w-full min-h-screen bg-[#EEF3F9] text-slate-800 font-sans flex flex-col justify-between">
      {/* ================= A) TOP HEADER BAR ================= */}
      <header className="w-full bg-gradient-to-r from-[#1B3A63] to-[#163257] text-white px-8 py-3.5 shadow-md border-b border-blue-950 flex items-center justify-between shrink-0">
        {/* Left: Barber Pole Icon + Title */}
        <div className="flex items-center space-x-3.5">
          {/* Animated Barber Pole Icon */}
          <div className="relative w-5 h-9 rounded-full overflow-hidden border-2 border-amber-300 shadow-sm barber-pole-stripes flex flex-col justify-between items-center">
            <div className="w-full h-1.5 bg-amber-400 rounded-t" />
            <div className="w-full h-1.5 bg-amber-400 rounded-b" />
          </div>

          <h1 className="text-[26px] font-bold tracking-tight text-white drop-shadow-xs">
            Sleeping Barber Problem Simulator
          </h1>
        </div>

        {/* Right: Topic Links */}
        <div className="flex items-center space-x-3 text-slate-300 text-sm font-medium">
          <span className="hover:text-white transition-colors">Process Synchronization</span>
          <span className="text-slate-500 font-thin">|</span>
          <span className="hover:text-white transition-colors">Operating Systems</span>
        </div>
      </header>

      {/* ================= B) CONTROLS ROW ================= */}
      <div className="w-full max-w-[1536px] mx-auto px-8 pt-4 pb-2">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center space-x-4 flex-wrap gap-y-2">
            {/* Card 1: Number of Waiting Chairs */}
            <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs px-4 py-2.5 flex items-center space-x-3">
              <label htmlFor="chairsInput" className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                Number of Waiting Chairs:
              </label>
              <input
                id="chairsInput"
                type="number"
                min={1}
                max={6}
                value={numChairs}
                disabled={isRunning || hasStarted}
                onChange={(e) => {
                  const val = Math.max(1, Math.min(6, parseInt(e.target.value) || 1));
                  setNumChairs(val);
                }}
                className="w-16 px-2.5 py-1 text-sm font-bold text-center text-[#1B3A63] bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:bg-slate-100 transition"
              />
              <span className="text-[10px] text-slate-400 font-medium">(1-6)</span>
            </div>

            {/* Card 2: Number of Customers */}
            <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs px-4 py-2.5 flex items-center space-x-3">
              <label htmlFor="customersInput" className="text-xs font-semibold text-slate-700 whitespace-nowrap">
                Number of Customers:
              </label>
              <input
                id="customersInput"
                type="number"
                min={1}
                max={10}
                value={numCustomers}
                disabled={isRunning || hasStarted}
                onChange={(e) => {
                  const val = Math.max(1, Math.min(10, parseInt(e.target.value) || 1));
                  setNumCustomers(val);
                }}
                className="w-16 px-2.5 py-1 text-sm font-bold text-center text-[#1B3A63] bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:bg-slate-100 transition"
              />
              <span className="text-[10px] text-slate-400 font-medium">(1-10)</span>
            </div>

            {/* Simulation Speed Toggle (Ergonomic test feature) */}
            <button
              onClick={() => setSpeedMultiplier((prev) => (prev === 1 ? 2 : 1))}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border flex items-center space-x-1.5 transition cursor-pointer ${
                speedMultiplier === 2
                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
              title="Toggle 1x Normal Speed vs 2x Fast-Forward"
            >
              <FastForward className="w-3.5 h-3.5" />
              <span>Speed: {speedMultiplier}x</span>
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-3">
            {/* Start Simulation Button */}
            <button
              onClick={handleStartSimulation}
              disabled={isRunning || hasStarted}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold flex items-center space-x-2 transition shadow-sm ${
                isRunning || hasStarted
                  ? 'bg-blue-300 text-white cursor-not-allowed'
                  : 'bg-[#2563EB] text-white hover:bg-blue-700 active:scale-98 cursor-pointer shadow-blue-200'
              }`}
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Start Simulation</span>
            </button>

            {/* Reset Button */}
            <button
              onClick={handleReset}
              disabled={!hasStarted}
              className={`px-4 py-2.5 rounded-xl text-sm font-bold flex items-center space-x-2 transition ${
                !hasStarted
                  ? 'bg-[#E2E8F0] text-[#9CA3AF] cursor-not-allowed border border-slate-200'
                  : 'bg-white text-slate-700 hover:bg-rose-50 hover:text-rose-600 border border-slate-300 cursor-pointer shadow-xs active:scale-98'
              }`}
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reset</span>
            </button>
          </div>
        </div>
      </div>

      {/* ================= C) MAIN AREA (TWO COLUMNS) ================= */}
      <main className="w-full max-w-[1536px] mx-auto px-8 py-2 flex-1 flex gap-6 items-start">
        {/* LEFT COLUMN (~70% width): Scene + Event Log */}
        <div className="w-[70%] flex flex-col space-y-4">
          {/* The Barber Shop Scene Panel */}
          <BarberShopScene
            numChairs={numChairs}
            barberState={barberState}
            currentCustomerInChair={currentCustomerInChair}
            waitingQueue={waitingQueue}
            incomingCustomers={incomingCustomers}
            walkingCustomer={walkingCustomer}
            haircutProgress={haircutProgress}
          />

          {/* Event Log Card */}
          <EventLog logs={logs} />
        </div>

        {/* RIGHT COLUMN (~30% width): Current Status & Statistics */}
        <div className="w-[30%] flex flex-col">
          <StatusAndStats
            barberState={barberState}
            waitingCount={waitingQueue.length}
            numChairs={numChairs}
            servedCount={servedCount}
            leftCount={leftCount}
            mutexLocked={mutexLocked}
          />
        </div>
      </main>

      {/* Subtle Bottom Note */}
      <footer className="w-full text-center py-2 text-[11px] text-slate-500 font-medium">
        Classic Process Synchronization Prototype • Mutex protects waiting queue • Customers & Barber Semaphores
      </footer>
    </div>
  );
}
