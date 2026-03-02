export enum ProductionStatus {
  IN_ANALYSIS = "in_analysis",
  RELEASED = "released",
  CLOSED = "closed"
}

// Map for UI display as requested in the workflow (Researching, Editing, Uploaded, Done)
// Note: The documentation specified 8 stages, but the prompt also mentioned 
// "Clear status display (Researching, Editing, Uploaded, Done)".
// I will align the 8 stages with these 4 categories for the "Clear status display" requirement
// or use the 8 stages as the primary source of truth from the documentation.
// I'll stick to the 8 stages from DOCUMENTATION.md as the primary source of truth.

export interface FilmAnalysis {
  tone: string;
  pacing: string;
  characters: string;
  marketability: number;
  targetAudience: string;
}

export interface Film {
  id: string;
  originalTitle: string;
  translatedTitle: string;
  score: number;
  status: ProductionStatus;
  summary_original: string | null;
  summary_vi: string;
  originalPoster?: string;
  editedPoster?: string;
  createdAt: string;
  updatedAt: string;
  // title is kept for display compatibility in some parts of the UI
  title: string;
}
