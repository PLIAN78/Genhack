"use client";
import React, { useMemo, useEffect, useState, useRef } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  Position,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { CombinedMetrics } from './LiveCamera';

interface NodeGraphProps {
  metrics: CombinedMetrics | null;
  riskScore: number;
}

export default function NodeGraph({ metrics, riskScore }: NodeGraphProps) {
  // Throttle updates to exactly 4 FPS (250ms) to prevent ReactFlow flickering 
  // from excessive re-renders (30FPS from camera).
  const [displayData, setDisplayData] = useState({ metrics, riskScore });
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    const now = Date.now();
    if (now - lastUpdateRef.current > 250) {
      setDisplayData({ metrics, riskScore });
      lastUpdateRef.current = now;
    }
    // Also schedule a fallback timeout in case metrics stop streaming to flush final state
    const timeoutId = setTimeout(() => {
      if (Date.now() - lastUpdateRef.current > 250) {
        setDisplayData({ metrics, riskScore });
        lastUpdateRef.current = Date.now();
      }
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [metrics, riskScore]);

  const { nodes, edges } = useMemo(() => {
    const m = displayData.metrics;
    const rScore = displayData.riskScore;
    
    const o = m?.ocular;
    const k = m?.kinetic;
    const c = m?.cardiac;
    const d = m?.deception;

    // ── Individual signal nodes (left column) ──
    const peripheralActive = !!o?.isPeripheralSweep;
    const saccadeActive = !!(o && o.saccadicSweepRate > 8);
    const blinkVolActive = !!(o && o.blinkRateVolatility > 0.3);
    const huddleActive = !!k?.isHuddling;
    const tremorActive = !!k?.isTremoring;
    const hrActive = !!(c && c.heartRate > 90 && c.heartRateConfidence > 0.2);
    const carotidActive = !!c?.carotidVisible;
    const deceptionActive = !!(d && d.verdict === 'DECEPTIVE');

    // Helper to create a signal node using FinUI inspired colors
    const makeNode = (
      id: string, label: string, y: number,
      active: boolean, category: 'ocular' | 'kinetic' | 'cardiac' | 'deception'
    ): Node => {
      const catColors = {
        ocular: { active: '#312e81', idle: '#1e293b', border: '#4f46e5' }, // indigo
        kinetic: { active: '#78350f', idle: '#1e293b', border: '#d97706' }, // amber
        cardiac: { active: '#7f1d1d', idle: '#1e293b', border: '#ef4444' }, // red
        deception: { active: '#4c1d95', idle: '#1e293b', border: '#8b5cf6' }, // violet
      };

      return {
        id,
        position: { x: 30, y },
        data: { label },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        style: {
          background: active ? catColors[category].active : catColors[category].idle,
          color: active ? '#ffffff' : '#94a3b8',
          border: active ? `1px solid ${catColors[category].border}` : '1px solid #334155',
          borderRadius: '8px',
          padding: '10px 14px',
          fontSize: '11px',
          fontFamily: 'monospace',
          minWidth: 210,
          boxShadow: active ? `0 0 15px ${catColors[category].active}40` : 'none',
          transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        },
      };
    };

    const signalNodes: Node[] = [
      makeNode('periph', `Peripheral Sweep ${peripheralActive ? `\n(${o?.gazeDeviationDeg?.toFixed(0)}°)` : ''}`, 20, peripheralActive, 'ocular'),
      makeNode('saccade', `Saccades ${saccadeActive ? `\n(${o?.saccadicSweepRate}/min)` : ''}`, 85, saccadeActive, 'ocular'),
      makeNode('blinkvol', `Blink Volatility ${blinkVolActive ? `\n(${o?.blinkRateVolatility?.toFixed(2)})` : ''}`, 150, blinkVolActive, 'ocular'),
      makeNode('huddle', `Ventral Shielding ${huddleActive ? `\n(${k?.shieldingDrop?.toFixed(0)}% drop)` : ''}`, 215, huddleActive, 'kinetic'),
      makeNode('tremor', `Hand Tremor ${tremorActive ? `\n(${k?.avgTremor?.toFixed(3)})` : ''}`, 280, tremorActive, 'kinetic'),
      makeNode('hr', `Heart Rate ${c && c.heartRate > 0 ? `\n(${c.heartRate} BPM)` : ''}`, 345, hrActive, 'cardiac'),
      makeNode('carotid', `Carotid Pulse ${carotidActive ? `\n(EVM: ${c?.carotidPulseStrength?.toFixed(2)})` : ''}`, 410, carotidActive, 'cardiac'),
    ];

    // ── Fusion node (center) ──
    const severity = rScore >= 50 ? 'High' : rScore >= 25 ? 'Medium' : 'Low';
    const fusionBg = severity === 'High' ? '#991b1b' : severity === 'Medium' ? '#92400e' : '#1e293b';
    const fusionBorder = severity === 'High' ? '#ef4444' : severity === 'Medium' ? '#f59e0b' : '#334155';

    const fusionNode: Node = {
      id: 'fusion',
      position: { x: 360, y: 195 },
      data: { label: `RISK LEVEL: ${rScore}/100\n${severity.toUpperCase()}` },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      style: {
        background: fusionBg,
        color: severity === 'Low' ? '#cbd5e1' : '#ffffff',
        border: `1px solid ${fusionBorder}`,
        borderRadius: '12px',
        padding: '16px 24px',
        fontWeight: 'bold',
        fontSize: '13px',
        fontFamily: 'monospace',
        textAlign: 'center' as const,
        minWidth: 180,
        boxShadow: severity === 'High' ? '0 0 30px rgba(239,68,68,0.3)' : severity === 'Medium' ? '0 0 20px rgba(245,158,11,0.2)' : 'none',
        transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
      },
    };

    // ── Deception verdict node (right) ──
    const verdictLabel = d
      ? `${d.verdict}\nProb: ${d.deceptionProbability}%\nConf: ${(d.confidence * 100).toFixed(0)}%`
      : 'Analyzing...';

    const isDeceptive = d?.verdict === 'DECEPTIVE';
    const isTruthful = d?.verdict === 'TRUTHFUL';

    const verdictBg = isDeceptive ? '#7f1d1d' : isTruthful ? '#064e3b' : '#1e293b';
    const verdictBorder = isDeceptive ? '#f87171' : isTruthful ? '#34d399' : '#334155';

    const verdictNode: Node = {
      id: 'verdict',
      position: { x: 620, y: 210 },
      data: { label: verdictLabel },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      style: {
        background: verdictBg,
        color: isDeceptive ? '#fee2e2' : isTruthful ? '#d1fae5' : '#94a3b8',
        border: `1px solid ${verdictBorder}`,
        borderRadius: '10px',
        padding: '12px 20px',
        fontWeight: 'bold',
        fontSize: '12px',
        fontFamily: 'monospace',
        textAlign: 'center' as const,
        minWidth: 160,
        boxShadow: isDeceptive ? '0 0 25px rgba(248,113,113,0.25)' : 'none',
        transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
      },
    };

    const allNodes = [...signalNodes, fusionNode, verdictNode];

    // ── Edges: active signals connect to fusion ──
    const signalIds = ['periph', 'saccade', 'blinkvol', 'huddle', 'tremor', 'hr', 'carotid'];
    const activeFlags = [peripheralActive, saccadeActive, blinkVolActive, huddleActive, tremorActive, hrActive, carotidActive];

    const allEdges: Edge[] = signalIds.map((id, i) => ({
      id: `e-${id}`,
      source: id,
      target: 'fusion',
      animated: activeFlags[i],
      style: {
        stroke: activeFlags[i] ? '#6366f1' : '#334155', // Indigo stroke for active
        strokeWidth: activeFlags[i] ? 2.5 : 1,
        transition: 'all 0.4s ease',
      },
    }));

    // Fusion → Verdict edge
    allEdges.push({
      id: 'e-fusion-verdict',
      source: 'fusion',
      target: 'verdict',
      animated: rScore >= 25,
      style: {
        stroke: rScore >= 50 ? '#ef4444' : rScore >= 25 ? '#f59e0b' : '#334155',
        strokeWidth: rScore >= 25 ? 2 : 1,
        transition: 'all 0.3s ease',
      },
    });

    return { nodes: allNodes, edges: allEdges };
  }, [displayData]);

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} color="#1e293b" />
      </ReactFlow>
    </div>
  );
}