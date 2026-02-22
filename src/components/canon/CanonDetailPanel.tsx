import { useState } from 'react';
import { X, User, MapPin, Cog, Gem, Scale, Milestone, Plus, Trash2, Heart, Brain, Sword, Eye, BookOpen, Clock, Sparkles, Loader2, Shield, AlertTriangle, GitBranch } from 'lucide-react';
import { useCanonStore } from '../../store/canon';
import { cn } from '../../lib/utils';
import { autoFillCharacter, autoFillLocation } from '../../lib/ai-autofill';
import { buildAutoFillPrompt, buildValidationPrompt } from '../../lib/prompt-builder';
import { useSettingsStore } from '../../store/settings';
import { VoicePreview } from '../features/VoicePreview';
import { detectChanges, generateValidationIssues } from '../../lib/validation-engine';
import { useValidationStore } from '../../store/validation';
import { useStore } from '../../store';
import type { AnyCanonEntry, CharacterEntry, LocationEntry, SystemEntry, ArtifactEntry, RuleEntry, EventEntry } from '../../types/canon';

// Reusable field components
function Field({ label, value, onChange, placeholder, multiline, className }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className="w-full mt-1 px-3 py-2 rounded-lg glass-input text-sm resize-none leading-relaxed"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full mt-1 px-3 py-2 rounded-lg glass-input text-sm"
        />
      )}
    </div>
  );
}

function TagList({ label, tags, onChange }: { label: string; tags: string[]; onChange: (tags: string[]) => void }) {
  const [input, setInput] = useState('');
  return (
    <div>
      <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">{label}</label>
      <div className="flex flex-wrap gap-1 mt-1">
        {tags.map((tag, i) => (
          <span key={i} className="glass-pill px-2 py-0.5 rounded-full text-xs flex items-center gap-1">
            {tag}
            <button onClick={() => onChange(tags.filter((_, j) => j !== i))} className="text-text-tertiary hover:text-error">×</button>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && input.trim()) {
              onChange([...tags, input.trim()]);
              setInput('');
            }
          }}
          placeholder="Add..."
          className="text-xs bg-transparent outline-none w-16 py-0.5"
        />
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children, defaultOpen = true }: {
  title: string; icon?: React.ElementType; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-black/5 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-5 py-3 text-xs font-semibold text-text-tertiary uppercase tracking-wider hover:bg-white/30 transition-colors"
      >
        {Icon && <Icon size={13} />}
        <span className="flex-1 text-left">{title}</span>
        <span className={cn('transition-transform text-[10px]', open ? 'rotate-180' : '')}>{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="px-5 pb-4 space-y-3 animate-fade-in">{children}</div>}
    </div>
  );
}

// ========== CHARACTER DETAIL ==========

function CharacterDetail({ entry, onUpdate }: { entry: CharacterEntry; onUpdate: (updates: any) => void }) {
  const c = entry.character;
  const update = (path: string, value: any) => {
    const parts = path.split('.');
    const newChar = { ...c };
    let obj: any = newChar;
    for (let i = 0; i < parts.length - 1; i++) {
      obj[parts[i]] = { ...obj[parts[i]] };
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = value;
    onUpdate({ character: newChar });
  };

  return (
    <>
      <Section title="Identity" icon={User} defaultOpen={true}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Full Name" value={c.fullName} onChange={(v) => update('fullName', v)} />
          <Field label="Age" value={c.age} onChange={(v) => update('age', v)} placeholder="e.g., 34" />
          <Field label="Gender" value={c.gender} onChange={(v) => update('gender', v)} />
          <Field label="Pronouns" value={c.pronouns} onChange={(v) => update('pronouns', v)} placeholder="e.g., she/her" />
          <Field label="Species" value={c.species} onChange={(v) => update('species', v)} />
          <Field label="Occupation" value={c.occupation} onChange={(v) => update('occupation', v)} />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Role</label>
          <div className="flex gap-1 mt-1">
            {(['protagonist', 'antagonist', 'supporting', 'minor', 'mentioned'] as const).map((role) => (
              <button
                key={role}
                onClick={() => update('role', role)}
                className={cn(
                  'px-2.5 py-1 text-xs rounded-lg transition-all capitalize',
                  c.role === role ? 'bg-text-primary text-text-inverse shadow-sm' : 'glass-pill text-text-secondary hover:bg-white/60'
                )}
              >
                {role}
              </button>
            ))}
          </div>
        </div>
        <TagList label="Aliases" tags={c.aliases} onChange={(v) => update('aliases', v)} />
      </Section>

      <Section title="Appearance" icon={Eye}>
        <Field label="Physical Description" value={c.appearance.physical} onChange={(v) => update('appearance.physical', v)} multiline placeholder="Height, build, hair, eyes..." />
        <Field label="Distinguishing Features" value={c.appearance.distinguishingFeatures} onChange={(v) => update('appearance.distinguishingFeatures', v)} placeholder="Scars, tattoos, mannerisms..." />
        <Field label="Style" value={c.appearance.style} onChange={(v) => update('appearance.style', v)} placeholder="Clothing, aesthetic..." />
      </Section>

      <Section title="Personality" icon={Brain}>
        <TagList label="Core Traits" tags={c.personality.traits} onChange={(v) => update('personality.traits', v)} />
        <TagList label="Strengths" tags={c.personality.strengths} onChange={(v) => update('personality.strengths', v)} />
        <TagList label="Flaws" tags={c.personality.flaws} onChange={(v) => update('personality.flaws', v)} />
        <TagList label="Fears" tags={c.personality.fears} onChange={(v) => update('personality.fears', v)} />
        <TagList label="Desires" tags={c.personality.desires} onChange={(v) => update('personality.desires', v)} />
        <TagList label="Values" tags={c.personality.values} onChange={(v) => update('personality.values', v)} />
        <TagList label="Quirks" tags={c.personality.quirks} onChange={(v) => update('personality.quirks', v)} />
        <Field label="Speech Pattern" value={c.personality.speechPattern} onChange={(v) => update('personality.speechPattern', v)} multiline placeholder="How do they talk? Formal, casual, metaphors..." />
        <Field label="Inner Voice" value={c.personality.innerVoice} onChange={(v) => update('personality.innerVoice', v)} multiline placeholder="How do they think? What's their internal monologue like?" />
      </Section>

      <Section title="Background" icon={BookOpen}>
        <Field label="Birthplace" value={c.background.birthplace} onChange={(v) => update('background.birthplace', v)} />
        <Field label="Upbringing" value={c.background.upbringing} onChange={(v) => update('background.upbringing', v)} multiline placeholder="How were they raised? What was their childhood like?" />
        <Field label="Education" value={c.background.education} onChange={(v) => update('background.education', v)} />
        <Field label="Trauma" value={c.background.trauma} onChange={(v) => update('background.trauma', v)} multiline placeholder="What haunts them?" />
        <Field label="Proudest Moment" value={c.background.proudestMoment} onChange={(v) => update('background.proudestMoment', v)} multiline />
        
        {/* Family */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Family</label>
            <button
              onClick={() => update('background.family', [...c.background.family, { name: '', relation: '', alive: true, description: '' }])}
              className="text-text-tertiary hover:text-text-primary transition-colors"
            >
              <Plus size={14} />
            </button>
          </div>
          {c.background.family.map((member, i) => (
            <div key={i} className="glass-pill rounded-xl p-3 mb-2 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input value={member.name} onChange={(e) => {
                  const fam = [...c.background.family];
                  fam[i] = { ...fam[i], name: e.target.value };
                  update('background.family', fam);
                }} placeholder="Name" className="px-2 py-1.5 rounded-lg glass-input text-xs" />
                <input value={member.relation} onChange={(e) => {
                  const fam = [...c.background.family];
                  fam[i] = { ...fam[i], relation: e.target.value };
                  update('background.family', fam);
                }} placeholder="Relation (mother, mentor...)" className="px-2 py-1.5 rounded-lg glass-input text-xs" />
              </div>
              <input value={member.description} onChange={(e) => {
                const fam = [...c.background.family];
                fam[i] = { ...fam[i], description: e.target.value };
                update('background.family', fam);
              }} placeholder="Brief description..." className="w-full px-2 py-1.5 rounded-lg glass-input text-xs" />
            </div>
          ))}
        </div>

        {/* Formative Events */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Formative Events</label>
            <button
              onClick={() => update('background.formativeEvents', [...c.background.formativeEvents, { age: '', event: '', impact: '' }])}
              className="text-text-tertiary hover:text-text-primary transition-colors"
            >
              <Plus size={14} />
            </button>
          </div>
          {c.background.formativeEvents.map((fe, i) => (
            <div key={i} className="glass-pill rounded-xl p-3 mb-2 space-y-2">
              <input value={fe.age} onChange={(e) => {
                const events = [...c.background.formativeEvents];
                events[i] = { ...events[i], age: e.target.value };
                update('background.formativeEvents', events);
              }} placeholder="Age (e.g., 12)" className="px-2 py-1.5 rounded-lg glass-input text-xs w-20" />
              <input value={fe.event} onChange={(e) => {
                const events = [...c.background.formativeEvents];
                events[i] = { ...events[i], event: e.target.value };
                update('background.formativeEvents', events);
              }} placeholder="What happened?" className="w-full px-2 py-1.5 rounded-lg glass-input text-xs" />
              <input value={fe.impact} onChange={(e) => {
                const events = [...c.background.formativeEvents];
                events[i] = { ...events[i], impact: e.target.value };
                update('background.formativeEvents', events);
              }} placeholder="How did it shape them?" className="w-full px-2 py-1.5 rounded-lg glass-input text-xs" />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Character Arc" icon={Sword}>
        <Field label="Starting State" value={c.arc.startingState} onChange={(v) => update('arc.startingState', v)} multiline placeholder="Who are they at the beginning?" />
        <Field label="Internal Conflict" value={c.arc.internalConflict} onChange={(v) => update('arc.internalConflict', v)} multiline />
        <Field label="External Conflict" value={c.arc.externalConflict} onChange={(v) => update('arc.externalConflict', v)} multiline />
        <div className="grid grid-cols-2 gap-3">
          <Field label="What They Want" value={c.arc.wantVsNeed.want} onChange={(v) => update('arc.wantVsNeed', { ...c.arc.wantVsNeed, want: v })} />
          <Field label="What They Need" value={c.arc.wantVsNeed.need} onChange={(v) => update('arc.wantVsNeed', { ...c.arc.wantVsNeed, need: v })} />
        </div>
        <Field label="Growth Direction" value={c.arc.growthDirection} onChange={(v) => update('arc.growthDirection', v)} multiline placeholder="How will they change?" />
        <Field label="Ending State" value={c.arc.endingState} onChange={(v) => update('arc.endingState', v)} multiline placeholder="Who are they at the end?" />
      </Section>

      <Section title="Story State" icon={Clock} defaultOpen={false}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Current Location" value={c.storyState.currentLocation} onChange={(v) => update('storyState.currentLocation', v)} />
          <Field label="Emotional State" value={c.storyState.emotionalState} onChange={(v) => update('storyState.emotionalState', v)} />
          <Field label="Allegiance" value={c.storyState.allegiance} onChange={(v) => update('storyState.allegiance', v)} />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Status</label>
          <button
            onClick={() => update('storyState.alive', !c.storyState.alive)}
            className={cn('px-2.5 py-1 text-xs rounded-lg transition-all', c.storyState.alive ? 'bg-success/10 text-success' : 'bg-error/10 text-error')}
          >
            {c.storyState.alive ? '● Alive' : '● Dead'}
          </button>
        </div>
        <TagList label="Knowledge State" tags={c.storyState.knowledgeState} onChange={(v) => update('storyState.knowledgeState', v)} />
      </Section>
    </>
  );
}

// ========== LOCATION DETAIL ==========

function LocationDetail({ entry, onUpdate }: { entry: LocationEntry; onUpdate: (updates: any) => void }) {
  const l = entry.location;
  const update = (path: string, value: any) => {
    const parts = path.split('.');
    const newLoc = { ...l };
    let obj: any = newLoc;
    for (let i = 0; i < parts.length - 1; i++) {
      obj[parts[i]] = { ...obj[parts[i]] };
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = value;
    onUpdate({ location: newLoc });
  };

  return (
    <>
      <Section title="Geography" icon={MapPin} defaultOpen={true}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Region" value={l.geography.region} onChange={(v) => update('geography.region', v)} />
          <Field label="Country" value={l.geography.country} onChange={(v) => update('geography.country', v)} />
          <Field label="Area" value={l.geography.area} onChange={(v) => update('geography.area', v)} placeholder="City, rural, wilderness..." />
          <Field label="Type" value={l.locationType} onChange={(v) => update('locationType', v)} placeholder="Building, city, forest..." />
          <Field label="Climate" value={l.geography.climate} onChange={(v) => update('geography.climate', v)} />
          <Field label="Terrain" value={l.geography.terrain} onChange={(v) => update('geography.terrain', v)} />
          <Field label="Size" value={l.geography.size} onChange={(v) => update('geography.size', v)} />
        </div>
      </Section>

      <Section title="History" icon={BookOpen}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Founded" value={l.history.founded} onChange={(v) => update('history.founded', v)} />
          <Field label="Founder" value={l.history.founder} onChange={(v) => update('history.founder', v)} />
        </div>
        <Field label="Cultural Significance" value={l.history.culturalSignificance} onChange={(v) => update('history.culturalSignificance', v)} multiline />
        <Field label="Legends" value={l.history.legends} onChange={(v) => update('history.legends', v)} multiline />
        
        {/* Ownership History */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Ownership History</label>
            <button
              onClick={() => update('history.ownership', [...l.history.ownership, { owner: '', period: '', howAcquired: '', howLost: '' }])}
              className="text-text-tertiary hover:text-text-primary"
            >
              <Plus size={14} />
            </button>
          </div>
          {l.history.ownership.map((record, i) => (
            <div key={i} className="glass-pill rounded-xl p-3 mb-2 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input value={record.owner} onChange={(e) => {
                  const own = [...l.history.ownership]; own[i] = { ...own[i], owner: e.target.value }; update('history.ownership', own);
                }} placeholder="Owner" className="px-2 py-1.5 rounded-lg glass-input text-xs" />
                <input value={record.period} onChange={(e) => {
                  const own = [...l.history.ownership]; own[i] = { ...own[i], period: e.target.value }; update('history.ownership', own);
                }} placeholder="Period" className="px-2 py-1.5 rounded-lg glass-input text-xs" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input value={record.howAcquired} onChange={(e) => {
                  const own = [...l.history.ownership]; own[i] = { ...own[i], howAcquired: e.target.value }; update('history.ownership', own);
                }} placeholder="How acquired" className="px-2 py-1.5 rounded-lg glass-input text-xs" />
                <input value={record.howLost} onChange={(e) => {
                  const own = [...l.history.ownership]; own[i] = { ...own[i], howLost: e.target.value }; update('history.ownership', own);
                }} placeholder="How lost" className="px-2 py-1.5 rounded-lg glass-input text-xs" />
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Atmosphere" icon={Eye}>
        <Field label="Condition" value={l.currentState.condition} onChange={(v) => update('currentState.condition', v)} />
        <Field label="Atmosphere / Mood" value={l.currentState.atmosphere} onChange={(v) => update('currentState.atmosphere', v)} multiline placeholder="What does it feel like to be here?" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sights" value={l.currentState.sensoryDetails.sights} onChange={(v) => update('currentState.sensoryDetails.sights', v)} multiline />
          <Field label="Sounds" value={l.currentState.sensoryDetails.sounds} onChange={(v) => update('currentState.sensoryDetails.sounds', v)} multiline />
          <Field label="Smells" value={l.currentState.sensoryDetails.smells} onChange={(v) => update('currentState.sensoryDetails.smells', v)} multiline />
          <Field label="Textures" value={l.currentState.sensoryDetails.textures} onChange={(v) => update('currentState.sensoryDetails.textures', v)} multiline />
        </div>
      </Section>

      <Section title="Story Relevance" icon={Sword} defaultOpen={false}>
        <Field label="Significance" value={l.storyRelevance.significance} onChange={(v) => update('storyRelevance.significance', v)} multiline />
        <Field label="Danger Level" value={l.storyRelevance.dangerLevel} onChange={(v) => update('storyRelevance.dangerLevel', v)} />
        <Field label="Access Rules" value={l.storyRelevance.accessRules} onChange={(v) => update('storyRelevance.accessRules', v)} multiline />
        <TagList label="Secrets Hidden" tags={l.storyRelevance.secretsHidden} onChange={(v) => update('storyRelevance.secretsHidden', v)} />
        <TagList label="Connected Locations" tags={l.storyRelevance.connectedLocations} onChange={(v) => update('storyRelevance.connectedLocations', v)} />
      </Section>
    </>
  );
}

// ========== SYSTEM DETAIL ==========

function SystemDetail({ entry, onUpdate }: { entry: SystemEntry; onUpdate: (updates: any) => void }) {
  const s = entry.system;
  const update = (path: string, value: any) => {
    const parts = path.split('.');
    const newSys = { ...s };
    let obj: any = newSys;
    for (let i = 0; i < parts.length - 1; i++) {
      obj[parts[i]] = { ...obj[parts[i]] };
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = value;
    onUpdate({ system: newSys });
  };

  return (
    <>
      <Section title="Classification" icon={Cog} defaultOpen={true}>
        <div>
          <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">System Type</label>
          <div className="flex flex-wrap gap-1 mt-1">
            {(['magic', 'technology', 'political', 'economic', 'religious', 'social', 'biological', 'other'] as const).map((t) => (
              <button key={t} onClick={() => update('systemType', t)}
                className={cn('px-2.5 py-1 text-xs rounded-lg transition-all capitalize',
                  s.systemType === t ? 'bg-text-primary text-text-inverse shadow-sm' : 'glass-pill text-text-secondary hover:bg-white/60'
                )}>{t}</button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Rules" icon={Scale}>
        <TagList label="Core Principles" tags={s.rules.corePrinciples} onChange={(v) => update('rules.corePrinciples', v)} />
        <TagList label="Limitations" tags={s.rules.limitations} onChange={(v) => update('rules.limitations', v)} />
        <Field label="Costs" value={s.rules.costs} onChange={(v) => update('rules.costs', v)} multiline placeholder="What does using this system cost?" />
        <TagList label="Exceptions" tags={s.rules.exceptions} onChange={(v) => update('rules.exceptions', v)} />
      </Section>

      <Section title="Structure" icon={GitBranch}>
        <Field label="Hierarchy" value={s.structure.hierarchy} onChange={(v) => update('structure.hierarchy', v)} multiline />
        <TagList label="Components" tags={s.structure.components} onChange={(v) => update('structure.components', v)} />
        <Field label="Interactions" value={s.structure.interactions} onChange={(v) => update('structure.interactions', v)} multiline />
        <Field label="History" value={s.structure.history} onChange={(v) => update('structure.history', v)} multiline />
        <Field label="Who Controls" value={s.structure.whoControls} onChange={(v) => update('structure.whoControls', v)} />
        <Field label="Who Is Affected" value={s.structure.whoIsAffected} onChange={(v) => update('structure.whoIsAffected', v)} />
      </Section>

      <Section title="Story Impact" icon={Sword} defaultOpen={false}>
        <TagList label="Conflicts Created" tags={s.storyImpact.conflictsCreated} onChange={(v) => update('storyImpact.conflictsCreated', v)} />
        <TagList label="Powers Enabled" tags={s.storyImpact.powersEnabled} onChange={(v) => update('storyImpact.powersEnabled', v)} />
        <Field label="Social Consequences" value={s.storyImpact.socialConsequences} onChange={(v) => update('storyImpact.socialConsequences', v)} multiline />
        <TagList label="Vulnerabilities" tags={s.storyImpact.vulnerabilities} onChange={(v) => update('storyImpact.vulnerabilities', v)} />
      </Section>
    </>
  );
}

// ========== ARTIFACT DETAIL ==========

function ArtifactDetail({ entry, onUpdate }: { entry: ArtifactEntry; onUpdate: (updates: any) => void }) {
  const a = entry.artifact;
  const update = (path: string, value: any) => {
    const parts = path.split('.');
    const newArt = { ...a };
    let obj: any = newArt;
    for (let i = 0; i < parts.length - 1; i++) {
      obj[parts[i]] = { ...obj[parts[i]] };
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = value;
    onUpdate({ artifact: newArt });
  };

  return (
    <>
      <Section title="Physical" icon={Eye} defaultOpen={true}>
        <Field label="Type" value={a.artifactType} onChange={(v) => update('artifactType', v)} placeholder="Weapon, book, jewelry..." />
        <Field label="Appearance" value={a.physical.appearance} onChange={(v) => update('physical.appearance', v)} multiline />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Material" value={a.physical.material} onChange={(v) => update('physical.material', v)} />
          <Field label="Size" value={a.physical.size} onChange={(v) => update('physical.size', v)} />
          <Field label="Weight" value={a.physical.weight} onChange={(v) => update('physical.weight', v)} />
          <Field label="Condition" value={a.physical.condition} onChange={(v) => update('physical.condition', v)} />
        </div>
        <Field label="Distinguishing Marks" value={a.physical.distinguishingMarks} onChange={(v) => update('physical.distinguishingMarks', v)} />
      </Section>

      <Section title="Properties" icon={Sparkles}>
        <TagList label="Abilities" tags={a.properties.abilities} onChange={(v) => update('properties.abilities', v)} />
        <TagList label="Limitations" tags={a.properties.limitations} onChange={(v) => update('properties.limitations', v)} />
        <Field label="Activation Method" value={a.properties.activationMethod} onChange={(v) => update('properties.activationMethod', v)} />
        <Field label="Side Effects" value={a.properties.sideEffects} onChange={(v) => update('properties.sideEffects', v)} multiline />
        <Field label="Power Level" value={a.properties.power} onChange={(v) => update('properties.power', v)} />
      </Section>

      <Section title="History" icon={BookOpen}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Creator" value={a.history.creator} onChange={(v) => update('history.creator', v)} />
          <Field label="Created" value={a.history.creationDate} onChange={(v) => update('history.creationDate', v)} />
          <Field label="Current Owner" value={a.history.currentOwner} onChange={(v) => update('history.currentOwner', v)} />
          <Field label="Current Location" value={a.history.currentLocation} onChange={(v) => update('history.currentLocation', v)} />
        </div>
        <Field label="Original Purpose" value={a.history.purpose} onChange={(v) => update('history.purpose', v)} multiline />
        <Field label="Legends" value={a.history.legends} onChange={(v) => update('history.legends', v)} multiline />
      </Section>

      <Section title="Story Relevance" icon={Sword} defaultOpen={false}>
        <Field label="Significance" value={a.storyRelevance.significance} onChange={(v) => update('storyRelevance.significance', v)} multiline />
        <TagList label="Who Seeks It" tags={a.storyRelevance.whoSeeksIt} onChange={(v) => update('storyRelevance.whoSeeksIt', v)} />
        <Field label="Prophecy" value={a.storyRelevance.prophecy} onChange={(v) => update('storyRelevance.prophecy', v)} multiline />
      </Section>
    </>
  );
}

// ========== RULE DETAIL ==========

function RuleDetail({ entry, onUpdate }: { entry: RuleEntry; onUpdate: (updates: any) => void }) {
  const r = entry.rule;
  const update = (key: string, value: any) => {
    onUpdate({ rule: { ...r, [key]: value } });
  };

  return (
    <>
      <Section title="Rule Definition" icon={Scale} defaultOpen={true}>
        <div>
          <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Rule Type</label>
          <div className="flex flex-wrap gap-1 mt-1">
            {(['immutable', 'bendable', 'social', 'physical', 'magical'] as const).map((t) => (
              <button key={t} onClick={() => update('ruleType', t)}
                className={cn('px-2.5 py-1 text-xs rounded-lg transition-all capitalize',
                  r.ruleType === t ? 'bg-text-primary text-text-inverse shadow-sm' : 'glass-pill text-text-secondary hover:bg-white/60'
                )}>{t}</button>
            ))}
          </div>
        </div>
        <Field label="Statement" value={r.statement} onChange={(v) => update('statement', v)} multiline placeholder="The rule itself — clearly stated" />
        <Field label="Scope" value={r.scope} onChange={(v) => update('scope', v)} placeholder="What/who does this apply to?" />
        <Field label="Origin" value={r.origin} onChange={(v) => update('origin', v)} multiline placeholder="Where does this rule come from?" />
      </Section>

      <Section title="Enforcement" icon={Shield}>
        <Field label="How Enforced" value={r.enforcement} onChange={(v) => update('enforcement', v)} multiline />
        <Field label="Consequences" value={r.consequences} onChange={(v) => update('consequences', v)} multiline placeholder="What happens when broken?" />
        <TagList label="Exceptions" tags={r.exceptions} onChange={(v) => update('exceptions', v)} />
        <TagList label="Known By" tags={r.knownBy} onChange={(v) => update('knownBy', v)} />
      </Section>

      <Section title="Violations" icon={AlertTriangle} defaultOpen={false}>
        <div className="flex items-center gap-3">
          <button onClick={() => update('canBeBroken', !r.canBeBroken)}
            className={cn('px-2.5 py-1 text-xs rounded-lg transition-all',
              r.canBeBroken ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'
            )}>{r.canBeBroken ? '⚠ Breakable' : '✓ Unbreakable'}</button>
          {r.canBeBroken && (
            <button onClick={() => update('hasBeenBroken', !r.hasBeenBroken)}
              className={cn('px-2.5 py-1 text-xs rounded-lg transition-all',
                r.hasBeenBroken ? 'bg-error/10 text-error' : 'glass-pill text-text-secondary'
              )}>{r.hasBeenBroken ? '✗ Has Been Broken' : 'Not Yet Broken'}</button>
          )}
        </div>
        {r.hasBeenBroken && (
          <>
            <Field label="Broken By" value={r.brokenBy} onChange={(v) => update('brokenBy', v)} />
            <Field label="Resulting Consequences" value={r.brokenConsequences} onChange={(v) => update('brokenConsequences', v)} multiline />
          </>
        )}
      </Section>
    </>
  );
}

// ========== EVENT DETAIL ==========

function EventDetail({ entry, onUpdate }: { entry: EventEntry; onUpdate: (updates: any) => void }) {
  const e = entry.event;
  const update = (path: string, value: any) => {
    const parts = path.split('.');
    const newEvt = { ...e };
    let obj: any = newEvt;
    for (let i = 0; i < parts.length - 1; i++) {
      obj[parts[i]] = { ...obj[parts[i]] };
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = value;
    onUpdate({ event: newEvt });
  };

  return (
    <>
      <Section title="Event" icon={Milestone} defaultOpen={true}>
        <div>
          <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Event Type</label>
          <div className="flex flex-wrap gap-1 mt-1">
            {(['historical', 'political', 'natural', 'personal', 'supernatural', 'military'] as const).map((t) => (
              <button key={t} onClick={() => update('eventType', t)}
                className={cn('px-2.5 py-1 text-xs rounded-lg transition-all capitalize',
                  e.eventType === t ? 'bg-text-primary text-text-inverse shadow-sm' : 'glass-pill text-text-secondary hover:bg-white/60'
                )}>{t}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Date" value={e.date} onChange={(v) => update('date', v)} />
          <Field label="Duration" value={e.duration} onChange={(v) => update('duration', v)} />
          <Field label="Location" value={e.location} onChange={(v) => update('location', v)} />
        </div>
        <Field label="Summary" value={e.summary} onChange={(v) => update('summary', v)} multiline placeholder="What happened?" />
        <Field label="Cause" value={e.cause} onChange={(v) => update('cause', v)} multiline />
      </Section>

      <Section title="Participants" icon={User}>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Key Participants</label>
            <button onClick={() => update('participants', [...e.participants, { name: '', role: '' }])}
              className="text-text-tertiary hover:text-text-primary"><Plus size={14} /></button>
          </div>
          {e.participants.map((p, i) => (
            <div key={i} className="glass-pill rounded-xl p-3 mb-2 grid grid-cols-2 gap-2">
              <input value={p.name} onChange={(ev) => {
                const ps = [...e.participants]; ps[i] = { ...ps[i], name: ev.target.value }; update('participants', ps);
              }} placeholder="Name" className="px-2 py-1.5 rounded-lg glass-input text-xs" />
              <input value={p.role} onChange={(ev) => {
                const ps = [...e.participants]; ps[i] = { ...ps[i], role: ev.target.value }; update('participants', ps);
              }} placeholder="Role (leader, victim...)" className="px-2 py-1.5 rounded-lg glass-input text-xs" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Winners" value={e.winners} onChange={(v) => update('winners', v)} />
          <Field label="Losers" value={e.losers} onChange={(v) => update('losers', v)} />
        </div>
        <Field label="Casualties" value={e.casualties} onChange={(v) => update('casualties', v)} />
      </Section>

      <Section title="Consequences" icon={Sword}>
        <TagList label="Consequences" tags={e.consequences} onChange={(v) => update('consequences', v)} />
        <Field label="Immediate Impact" value={e.impact.immediate} onChange={(v) => update('impact.immediate', v)} multiline />
        <Field label="Long-Term Impact" value={e.impact.longTerm} onChange={(v) => update('impact.longTerm', v)} multiline />
        <Field label="Cultural Memory" value={e.impact.culturalMemory} onChange={(v) => update('impact.culturalMemory', v)} multiline placeholder="How is this event remembered?" />
        <button onClick={() => update('impact.stillRelevant', !e.impact.stillRelevant)}
          className={cn('px-2.5 py-1 text-xs rounded-lg transition-all',
            e.impact.stillRelevant ? 'bg-success/10 text-success' : 'glass-pill text-text-tertiary'
          )}>{e.impact.stillRelevant ? '● Still Relevant' : '○ Historical Only'}</button>
        <TagList label="Triggered Events" tags={e.impact.triggeredEvents} onChange={(v) => update('impact.triggeredEvents', v)} />
      </Section>
    </>
  );
}

// ========== MAIN PANEL ==========

interface Props {
  entry: AnyCanonEntry;
  onClose: () => void;
}

export function CanonDetailPanel({ entry, onClose }: Props) {
  const { updateEntry, deleteEntry, getEntry } = useCanonStore();
  const { addIssues, addImpactReport } = useValidationStore();
  const { getProjectChapters } = useStore();
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [lastSnapshot, setLastSnapshot] = useState<AnyCanonEntry>(JSON.parse(JSON.stringify(entry)));

  const typeIcons: Record<string, React.ElementType> = {
    character: User, location: MapPin, system: Cog, artifact: Gem, rule: Scale, event: Milestone,
  };
  const Icon = typeIcons[entry.type] || BookOpen;

  const handleUpdate = (updates: any) => {
    updateEntry(entry.id, updates);
  };

  // Run impact analysis — compares current state to last snapshot
  const runImpactCheck = () => {
    const currentEntry = getEntry(entry.id);
    if (!currentEntry) return;
    
    const changes = detectChanges(lastSnapshot, currentEntry);
    if (changes.length === 0) return;

    const chapters = getProjectChapters(currentEntry.projectId);
    
    // Build validation prompt for AI-powered continuity checking
    const { getActiveProject } = useStore.getState();
    const project = getActiveProject();
    if (project) {
      const validationPrompt = buildValidationPrompt(currentEntry, changes, chapters, project);
      console.log('=== VALIDATION PROMPT ===');
      console.log(validationPrompt);
      console.log('=== END PROMPT ===');
    }

    // For now, use structural validation — will be replaced with AI validation
    const issues = generateValidationIssues(currentEntry, changes, chapters.length);
    
    if (issues.length > 0) {
      addIssues(issues);
      addImpactReport({
        canonEntryId: currentEntry.id,
        canonEntryName: currentEntry.name,
        changeDescription: changes.map(c => `${c.field}: "${c.oldValue}" → "${c.newValue}"`).join('; '),
        issues,
        affectedChapters: chapters.map(ch => ({
          number: ch.number,
          title: ch.title,
          severity: issues.reduce((max, i) => {
            const order = { critical: 4, error: 3, warning: 2, info: 1 };
            return order[i.severity] > order[max] ? i.severity : max;
          }, 'info' as any),
        })),
        timestamp: new Date().toISOString(),
      });
    }

    // Update snapshot
    setLastSnapshot(JSON.parse(JSON.stringify(currentEntry)));
  };

  const handleAutoFill = async () => {
    setIsAutoFilling(true);
    
    // Build context-aware prompt using project settings
    const { getActiveProject } = useStore.getState();
    const { settings } = useSettingsStore.getState();
    const project = getActiveProject();
    
    if (project) {
      const prompt = buildAutoFillPrompt(entry, project, settings);
      console.log('=== AUTO-FILL PROMPT ===');
      console.log(prompt);
      console.log('=== END PROMPT ===');
    }

    // Simulate AI delay — will be replaced with actual API call using the prompt above
    await new Promise(r => setTimeout(r, 1500));
    
    if (entry.type === 'character') {
      const filled = autoFillCharacter(entry as CharacterEntry);
      handleUpdate({ character: filled });
    } else if (entry.type === 'location') {
      const filled = autoFillLocation(entry as LocationEntry);
      handleUpdate({ location: filled });
    }
    setIsAutoFilling(false);
  };

  return (
    <div className="h-full flex flex-col bg-white rounded-l-2xl shadow-xl border-l border-black/5 animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-black/5">
        <div className="w-8 h-8 rounded-xl glass-pill flex items-center justify-center">
          <Icon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={entry.name}
            onChange={(e) => handleUpdate({ name: e.target.value })}
            className="text-lg font-serif font-semibold bg-transparent border-none outline-none w-full"
            placeholder="Name..."
          />
          <div className="text-xs text-text-tertiary capitalize">{entry.type}</div>
        </div>
        
        {/* Check Impact button */}
        <button
          onClick={runImpactCheck}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium glass-pill text-text-secondary hover:bg-white/60 transition-all active:scale-[0.97]"
        >
          <Shield size={12} /> Check Impact
        </button>

        {/* Auto-fill button */}
        <button
          onClick={handleAutoFill}
          disabled={isAutoFilling}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-[0.97]',
            isAutoFilling
              ? 'bg-black/5 text-text-tertiary cursor-wait'
              : 'bg-text-primary text-text-inverse shadow-md hover:shadow-lg'
          )}
        >
          {isAutoFilling ? (
            <><Loader2 size={12} className="animate-spin" /> Generating...</>
          ) : (
            <><Sparkles size={12} /> Auto-fill</>
          )}
        </button>
        
        <button onClick={onClose} className="p-1.5 rounded-xl text-text-tertiary hover:text-text-primary hover:bg-black/5 transition-all">
          <X size={16} />
        </button>
      </div>

      {/* Description */}
      <div className="px-5 py-3 border-b border-black/5">
        <textarea
          value={entry.description}
          onChange={(e) => handleUpdate({ description: e.target.value })}
          placeholder="Brief description..."
          rows={2}
          className="w-full bg-transparent text-sm text-text-secondary resize-none outline-none leading-relaxed"
        />
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        {entry.type === 'character' && (
          <>
            <CharacterDetail entry={entry as CharacterEntry} onUpdate={handleUpdate} />
            <VoicePreview character={entry as CharacterEntry} />
          </>
        )}
        {entry.type === 'location' && <LocationDetail entry={entry as LocationEntry} onUpdate={handleUpdate} />}
        {entry.type === 'system' && <SystemDetail entry={entry as SystemEntry} onUpdate={handleUpdate} />}
        {entry.type === 'artifact' && <ArtifactDetail entry={entry as ArtifactEntry} onUpdate={handleUpdate} />}
        {entry.type === 'rule' && <RuleDetail entry={entry as RuleEntry} onUpdate={handleUpdate} />}
        {entry.type === 'event' && <EventDetail entry={entry as EventEntry} onUpdate={handleUpdate} />}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-black/5 flex items-center justify-between">
        <TagList label="" tags={entry.tags} onChange={(v) => handleUpdate({ tags: v })} />
        <button
          onClick={() => { deleteEntry(entry.id); onClose(); }}
          className="p-1.5 rounded-xl text-text-tertiary hover:text-error hover:bg-error/5 transition-all"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
