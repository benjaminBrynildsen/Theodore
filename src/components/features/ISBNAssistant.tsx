import { useState } from 'react';
import { Barcode, Check, ChevronRight, ExternalLink, AlertCircle, Copy } from 'lucide-react';
import { useStore } from '../../store';
import { cn } from '../../lib/utils';

type Step = 'overview' | 'isbn' | 'copyright' | 'lccn' | 'complete';

interface StepData {
  isbn?: string;
  copyrightNumber?: string;
  lccn?: string;
}

export function ISBNAssistant() {
  const { getActiveProject } = useStore();
  const project = getActiveProject();
  const [currentStep, setCurrentStep] = useState<Step>('overview');
  const [data, setData] = useState<StepData>({});
  const [copied, setCopied] = useState<string | null>(null);

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const steps: { id: Step; label: string; required: boolean; done: boolean }[] = [
    { id: 'isbn', label: 'ISBN Registration', required: true, done: !!data.isbn },
    { id: 'copyright', label: 'Copyright Registration', required: false, done: !!data.copyrightNumber },
    { id: 'lccn', label: 'Library of Congress (LCCN)', required: false, done: !!data.lccn },
  ];

  return (
    <div className="p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold">ISBN & Copyright Assistant</h3>
        <p className="text-xs text-text-tertiary">Step-by-step guide through the publishing bureaucracy.</p>
      </div>

      {currentStep === 'overview' && (
        <div className="space-y-3 animate-fade-in">
          {/* Pre-filled metadata preview */}
          <div className="glass-pill rounded-xl p-4">
            <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">Your Book Metadata</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <span className="text-text-tertiary">Title</span>
              <span className="text-text-secondary font-medium">{project?.title || 'Untitled'}</span>
              <span className="text-text-tertiary">Type</span>
              <span className="text-text-secondary">{project?.subtype || 'Novel'}</span>
              <span className="text-text-tertiary">Format</span>
              <span className="text-text-secondary">Paperback + eBook</span>
              <span className="text-text-tertiary">Language</span>
              <span className="text-text-secondary">English</span>
            </div>
          </div>

          {/* Steps */}
          <div className="space-y-2">
            {steps.map((step) => (
              <button
                key={step.id}
                onClick={() => setCurrentStep(step.id)}
                className="w-full flex items-center gap-3 p-3 rounded-xl glass-pill hover:bg-white/60 transition-colors"
              >
                <div className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0',
                  step.done ? 'bg-success text-white' : 'bg-black/5 text-text-tertiary'
                )}>
                  {step.done ? <Check size={12} /> : steps.indexOf(step) + 1}
                </div>
                <div className="flex-1 text-left">
                  <div className="text-xs font-medium">{step.label}</div>
                  <div className="text-[10px] text-text-tertiary">{step.required ? 'Required for publishing' : 'Recommended'}</div>
                </div>
                <ChevronRight size={14} className="text-text-tertiary" />
              </button>
            ))}
          </div>
        </div>
      )}

      {currentStep === 'isbn' && (
        <div className="space-y-4 animate-fade-in">
          <button onClick={() => setCurrentStep('overview')} className="text-xs text-text-tertiary hover:text-text-primary">← Back</button>
          
          <div className="glass-pill rounded-xl p-4 space-y-3">
            <div className="text-sm font-semibold">ISBN Registration</div>
            <p className="text-xs text-text-secondary leading-relaxed">
              An ISBN (International Standard Book Number) is a 13-digit number that uniquely identifies your book. Required for selling on Amazon, bookstores, and libraries.
            </p>
            
            <div className="space-y-2 text-xs">
              <div className="font-medium">Option 1: Through KDP (Free)</div>
              <p className="text-text-tertiary">Amazon assigns a free ISBN when you publish through KDP. However, the publisher of record will be Amazon, not you.</p>
              
              <div className="font-medium mt-3">Option 2: Buy Your Own ($125 for 1, $295 for 10)</div>
              <p className="text-text-tertiary">Purchase from Bowker (myidentifiers.com) — the only official US ISBN agency. You retain full publishing rights.</p>
              
              <a href="https://www.myidentifiers.com" target="_blank" rel="noopener"
                className="inline-flex items-center gap-1 text-blue-600 hover:underline mt-2">
                Go to Bowker <ExternalLink size={11} />
              </a>
            </div>

            <div className="border-t border-black/5 pt-3 mt-3">
              <div className="text-[10px] font-semibold text-text-tertiary uppercase mb-1.5">Pre-filled for Bowker registration:</div>
              <div className="glass-input rounded-lg p-3 text-xs space-y-1">
                <div>Title: <strong>{project?.title}</strong></div>
                <div>Format: <strong>Trade Paperback</strong></div>
                <div>Language: <strong>English</strong></div>
                <div>Subject: <strong>Fiction / Fantasy / Contemporary</strong></div>
              </div>
              <button
                onClick={() => copyText(`Title: ${project?.title}\nFormat: Trade Paperback\nLanguage: English\nSubject: Fiction / Fantasy / Contemporary`, 'metadata')}
                className="mt-2 text-xs text-text-tertiary hover:text-text-primary flex items-center gap-1"
              >
                {copied === 'metadata' ? <><Check size={11} className="text-success" /> Copied</> : <><Copy size={11} /> Copy for form</>}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs text-text-tertiary mb-1 block">Enter your ISBN once assigned:</label>
            <input
              value={data.isbn || ''}
              onChange={e => setData(prev => ({ ...prev, isbn: e.target.value }))}
              placeholder="978-0-000000-00-0"
              className="w-full px-3 py-2 rounded-lg glass-input text-xs font-mono"
            />
          </div>

          <button
            onClick={() => setCurrentStep('overview')}
            className="w-full py-2 rounded-xl bg-text-primary text-text-inverse text-xs font-medium"
          >
            {data.isbn ? 'Save & Continue' : 'Skip for Now'}
          </button>
        </div>
      )}

      {currentStep === 'copyright' && (
        <div className="space-y-4 animate-fade-in">
          <button onClick={() => setCurrentStep('overview')} className="text-xs text-text-tertiary hover:text-text-primary">← Back</button>

          <div className="glass-pill rounded-xl p-4 space-y-3">
            <div className="text-sm font-semibold">Copyright Registration</div>
            <p className="text-xs text-text-secondary leading-relaxed">
              Your work is copyrighted automatically when you write it. Registration with the US Copyright Office ($65 online) gives you legal standing to sue for infringement and statutory damages.
            </p>

            <div className="bg-amber-50 rounded-lg p-3 flex gap-2">
              <AlertCircle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">Register before or within 3 months of publication for maximum legal protection.</p>
            </div>

            <a href="https://www.copyright.gov/registration/" target="_blank" rel="noopener"
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
              US Copyright Office <ExternalLink size={11} />
            </a>

            <div>
              <label className="text-xs text-text-tertiary mb-1 block">Copyright registration number:</label>
              <input
                value={data.copyrightNumber || ''}
                onChange={e => setData(prev => ({ ...prev, copyrightNumber: e.target.value }))}
                placeholder="TXu-000-000"
                className="w-full px-3 py-2 rounded-lg glass-input text-xs font-mono"
              />
            </div>
          </div>

          <button onClick={() => setCurrentStep('overview')} className="w-full py-2 rounded-xl bg-text-primary text-text-inverse text-xs font-medium">
            {data.copyrightNumber ? 'Save & Continue' : 'Skip for Now'}
          </button>
        </div>
      )}

      {currentStep === 'lccn' && (
        <div className="space-y-4 animate-fade-in">
          <button onClick={() => setCurrentStep('overview')} className="text-xs text-text-tertiary hover:text-text-primary">← Back</button>

          <div className="glass-pill rounded-xl p-4 space-y-3">
            <div className="text-sm font-semibold">Library of Congress Control Number</div>
            <p className="text-xs text-text-secondary leading-relaxed">
              An LCCN helps libraries catalog your book. Apply through the Preassigned Control Number Program before publication. Free, but you must have your own ISBN (not KDP-assigned).
            </p>

            <a href="https://www.loc.gov/publish/pcn/" target="_blank" rel="noopener"
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
              LOC PCN Program <ExternalLink size={11} />
            </a>

            <div>
              <label className="text-xs text-text-tertiary mb-1 block">LCCN:</label>
              <input
                value={data.lccn || ''}
                onChange={e => setData(prev => ({ ...prev, lccn: e.target.value }))}
                placeholder="2026000000"
                className="w-full px-3 py-2 rounded-lg glass-input text-xs font-mono"
              />
            </div>
          </div>

          <button onClick={() => setCurrentStep('overview')} className="w-full py-2 rounded-xl bg-text-primary text-text-inverse text-xs font-medium">
            {data.lccn ? 'Save & Continue' : 'Skip for Now'}
          </button>
        </div>
      )}
    </div>
  );
}
