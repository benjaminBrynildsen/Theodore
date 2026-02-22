import { useState, useMemo, useRef, useEffect } from 'react';
import { Users, Sparkles, Loader2, ZoomIn, ZoomOut } from 'lucide-react';
import { useCanonStore } from '../../store/canon';
import { useStore } from '../../store';
import { cn } from '../../lib/utils';

interface CharNode {
  id: string;
  name: string;
  role: string;
  x: number;
  y: number;
}

interface Relationship {
  from: string;
  to: string;
  type: 'ally' | 'rival' | 'family' | 'romantic' | 'mentor' | 'neutral';
  label: string;
  sharedScenes: number;
}

const REL_COLORS: Record<string, string> = {
  ally: '#10b981', rival: '#ef4444', family: '#8b5cf6',
  romantic: '#ec4899', mentor: '#f59e0b', neutral: '#94a3b8',
};

const REL_DASH: Record<string, string> = {
  ally: '', rival: '6,4', family: '', romantic: '2,4', mentor: '8,4', neutral: '4,4',
};

export function CharacterRelationshipMap() {
  const { entries } = useCanonStore();
  const { getActiveProject } = useStore();
  const project = getActiveProject();
  const characters = entries.filter(e => e.projectId === project?.id && e.type === 'character');
  const [analyzing, setAnalyzing] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Position characters in a circle
  const [nodes, setNodes] = useState<CharNode[]>(() => {
    if (characters.length === 0) {
      // Demo data
      return [
        { id: '1', name: 'Elara Voss', role: 'protagonist', x: 300, y: 150 },
        { id: '2', name: 'The Gardener', role: 'deuteragonist', x: 500, y: 150 },
        { id: '3', name: 'Dr. Marcus Webb', role: 'supporting', x: 200, y: 300 },
        { id: '4', name: 'Grandmother (Iris)', role: 'mentioned', x: 400, y: 350 },
        { id: '5', name: 'The Garden', role: 'antagonist', x: 550, y: 300 },
      ];
    }
    const cx = 350, cy = 220, r = 150;
    return characters.map((c, i) => {
      const angle = (i / characters.length) * Math.PI * 2 - Math.PI / 2;
      return { id: c.id, name: c.name, role: (c as any).character?.role || 'unknown', x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
    });
  });

  const [relationships, setRelationships] = useState<Relationship[]>([
    { from: '1', to: '2', type: 'mentor', label: 'Guide / ward', sharedScenes: 8 },
    { from: '1', to: '3', type: 'ally', label: 'Colleague', sharedScenes: 4 },
    { from: '1', to: '4', type: 'family', label: 'Granddaughter', sharedScenes: 2 },
    { from: '2', to: '5', type: 'ally', label: 'Caretaker', sharedScenes: 12 },
    { from: '2', to: '4', type: 'neutral', label: 'Previous keeper', sharedScenes: 0 },
    { from: '1', to: '5', type: 'rival', label: 'Being claimed', sharedScenes: 6 },
    { from: '3', to: '1', type: 'romantic', label: 'Unrequited interest', sharedScenes: 3 },
  ]);

  const [selectedRel, setSelectedRel] = useState<Relationship | null>(null);

  const handleDrag = (nodeId: string, e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();

    const onMove = (ev: MouseEvent) => {
      const x = (ev.clientX - rect.left) / zoom;
      const y = (ev.clientY - rect.top) / zoom;
      setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, x, y } : n));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setDragging(null);
    };
    setDragging(nodeId);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const analyze = async () => {
    setAnalyzing(true);
    await new Promise(r => setTimeout(r, 2000));
    setAnalyzing(false);
  };

  // Find isolation warnings
  const connectedIds = new Set(relationships.flatMap(r => [r.from, r.to]));
  const isolatedNodes = nodes.filter(n => !connectedIds.has(n.id));

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold">Character Relationships</h3>
          <p className="text-xs text-text-tertiary">Drag characters to rearrange. Click connections to see details.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} className="p-1 text-text-tertiary hover:text-text-primary"><ZoomOut size={14} /></button>
          <span className="text-[10px] font-mono text-text-tertiary">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="p-1 text-text-tertiary hover:text-text-primary"><ZoomIn size={14} /></button>
          <button onClick={analyze} disabled={analyzing}
            className="px-3 py-1.5 rounded-xl bg-text-primary text-text-inverse text-xs font-medium flex items-center gap-1.5 disabled:opacity-50">
            {analyzing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {analyzing ? 'Analyzing...' : 'Auto-detect'}
          </button>
        </div>
      </div>

      <div className="glass-pill rounded-2xl overflow-hidden" style={{ height: 400 }}>
        <svg ref={svgRef} viewBox="0 0 700 440" className="w-full h-full" style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}>
          {/* Relationship lines */}
          {relationships.map((rel, i) => {
            const from = nodes.find(n => n.id === rel.from);
            const to = nodes.find(n => n.id === rel.to);
            if (!from || !to) return null;
            const selected = selectedRel === rel;
            return (
              <g key={i} onClick={() => setSelectedRel(selected ? null : rel)} style={{ cursor: 'pointer' }}>
                <line
                  x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                  stroke={REL_COLORS[rel.type]}
                  strokeWidth={selected ? 3 : 1.5}
                  strokeDasharray={REL_DASH[rel.type]}
                  strokeOpacity={selected ? 1 : 0.6}
                />
                {/* Label on line */}
                <text
                  x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 6}
                  textAnchor="middle" fontSize={9} fill={REL_COLORS[rel.type]}
                  opacity={selected ? 1 : 0.7}
                >
                  {rel.label}
                </text>
              </g>
            );
          })}

          {/* Character nodes */}
          {nodes.map(node => {
            const isIsolated = isolatedNodes.includes(node);
            return (
              <g key={node.id} onMouseDown={(e) => handleDrag(node.id, e)} style={{ cursor: dragging === node.id ? 'grabbing' : 'grab' }}>
                <circle cx={node.x} cy={node.y} r={28} fill="white" stroke={isIsolated ? '#ef4444' : '#e5e7eb'} strokeWidth={isIsolated ? 2 : 1.5} />
                <circle cx={node.x} cy={node.y} r={26} fill="white" />
                <text x={node.x} y={node.y - 2} textAnchor="middle" fontSize={11} fontWeight={600} fill="#1a1a1a">
                  {node.name.split(' ')[0]}
                </text>
                <text x={node.x} y={node.y + 11} textAnchor="middle" fontSize={8} fill="#999" textTransform="capitalize">
                  {node.role}
                </text>
                {isIsolated && (
                  <text x={node.x} y={node.y + 42} textAnchor="middle" fontSize={8} fill="#ef4444">⚠ Isolated</text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-3">
        {Object.entries(REL_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 rounded" style={{ backgroundColor: color }} />
            <span className="text-[10px] text-text-tertiary capitalize">{type}</span>
          </div>
        ))}
      </div>

      {/* Selected relationship detail */}
      {selectedRel && (
        <div className="glass-pill rounded-xl p-3 mt-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-medium">{nodes.find(n => n.id === selectedRel.from)?.name}</span>
              <span className="text-xs text-text-tertiary mx-2">→</span>
              <span className="text-xs font-medium">{nodes.find(n => n.id === selectedRel.to)?.name}</span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full capitalize" style={{ backgroundColor: REL_COLORS[selectedRel.type] + '20', color: REL_COLORS[selectedRel.type] }}>
              {selectedRel.type}
            </span>
          </div>
          <div className="text-xs text-text-tertiary mt-1">{selectedRel.label} · {selectedRel.sharedScenes} shared scenes</div>
        </div>
      )}
    </div>
  );
}
