"use client";
import React, { useCallback } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Edge
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const initialNodes = [
  { id: '1', position: { x: 50, y: 150 }, data: { label: 'Repeated Obstruction\n(Vision: 0.99)' }, style: { background: '#7f1d1d', color: '#fff', border: 'none', borderRadius: '4px', padding: '10px' } },
  { id: '2', position: { x: 50, y: 250 }, data: { label: 'Sudden Motion\n(Vision: 0.95)' }, style: { background: '#7f1d1d', color: '#fff', border: 'none', borderRadius: '4px', padding: '10px' } },
  { id: '3', position: { x: 50, y: 350 }, data: { label: 'Elevated HR (115 BPM)\n(Physiology: 0.95)' }, style: { background: '#991b1b', color: '#fff', border: 'none', borderRadius: '4px', padding: '10px' } },
  { id: 'risk_core', position: { x: 400, y: 250 }, data: { label: 'HIGH RISK ALERT\nScore: 85/100' }, style: { background: '#ef4444', color: '#fff', border: '2px solid #fff', borderRadius: '8px', padding: '15px', fontWeight: 'bold' } },
];

const initialEdges = [
  { id: 'e1-risk', source: '1', target: 'risk_core', animated: true, style: { stroke: '#ef4444' } },
  { id: 'e2-risk', source: '2', target: 'risk_core', animated: true, style: { stroke: '#ef4444' } },
  { id: 'e3-risk', source: '3', target: 'risk_core', animated: true, style: { stroke: '#fca5a5' } },
];

export default function NodeGraph() {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params: Edge | Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
      >
        <Controls />
        <MiniMap />
        <Background gap={12} size={1} />
      </ReactFlow>
    </div>
  );
}
