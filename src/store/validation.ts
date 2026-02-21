import { create } from 'zustand';
import type { ValidationIssue, ImpactReport } from '../lib/validation-engine';

interface ValidationState {
  issues: ValidationIssue[];
  impactReports: ImpactReport[];
  showImpactPanel: boolean;
  activeReportId: string | null;
  
  addIssues: (issues: ValidationIssue[]) => void;
  addImpactReport: (report: ImpactReport) => void;
  resolveIssue: (id: string) => void;
  overrideIssue: (id: string, reason: string) => void;
  dismissIssue: (id: string) => void;
  setShowImpactPanel: (show: boolean) => void;
  getUnresolvedCount: () => number;
  getIssuesByChapter: (chapterNumber: number) => ValidationIssue[];
  getIssuesByCanonEntry: (entryId: string) => ValidationIssue[];
}

export const useValidationStore = create<ValidationState>((set, get) => ({
  issues: [],
  impactReports: [],
  showImpactPanel: false,
  activeReportId: null,

  addIssues: (newIssues) => set((s) => ({ 
    issues: [...s.issues, ...newIssues],
    showImpactPanel: newIssues.length > 0 ? true : s.showImpactPanel,
  })),

  addImpactReport: (report) => set((s) => ({
    impactReports: [report, ...s.impactReports],
    activeReportId: report.canonEntryId,
  })),

  resolveIssue: (id) => set((s) => ({
    issues: s.issues.map(i => i.id === id ? { ...i, resolved: true } : i),
  })),

  overrideIssue: (id, reason) => set((s) => ({
    issues: s.issues.map(i => i.id === id ? { ...i, overridden: true, overrideReason: reason } : i),
  })),

  dismissIssue: (id) => set((s) => ({
    issues: s.issues.filter(i => i.id !== id),
  })),

  setShowImpactPanel: (show) => set({ showImpactPanel: show }),

  getUnresolvedCount: () => get().issues.filter(i => !i.resolved && !i.overridden).length,

  getIssuesByChapter: (chapterNumber) => 
    get().issues.filter(i => !i.resolved && !i.overridden && i.affectedChapterIds.includes(chapterNumber)),

  getIssuesByCanonEntry: (entryId) => 
    get().issues.filter(i => !i.resolved && !i.overridden && i.canonEntryId === entryId),
}));
