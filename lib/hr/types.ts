// Job Types
export interface JobRequirements {
  skills: string[];
  experience: {
    min: number;
    max?: number;
    description?: string;
  };
  education?: {
    level: 'high_school' | 'bachelor' | 'master' | 'phd' | 'any';
    fields?: string[];
  };
  languages?: {
    language: string;
    level: 'basic' | 'intermediate' | 'advanced' | 'native';
  }[];
  certifications?: string[];
  softSkills?: string[];
}

export interface Job {
  id: string;
  user_id: string;
  title: string;
  description: string;
  requirements: JobRequirements;
  department?: string;
  location?: string;
  salary_range?: {
    min?: number;
    max?: number;
    currency?: string;
  };
  status: 'active' | 'closed' | 'draft';
  created_at: string;
  updated_at: string;
}

// Candidate Types
export interface ParsedCandidateData {
  name?: string;
  email?: string;
  phone?: string;
  skills: string[];
  experience: {
    company: string;
    position: string;
    duration: string;
    years?: number;
    description?: string;
  }[];
  education: {
    institution: string;
    degree: string;
    field?: string;
    year?: number;
  }[];
  languages?: {
    language: string;
    level?: string;
  }[];
  certifications?: string[];
  achievements?: string[];
  summary?: string;
  totalYearsExperience?: number;
}

export interface Candidate {
  id: string;
  user_id: string;
  name: string;
  email?: string;
  phone?: string;
  resume_url?: string;
  resume_text?: string;
  parsed_data: ParsedCandidateData;
  source?: string;
  status: 'new' | 'screening' | 'interview' | 'offer' | 'hired' | 'rejected';
  created_at: string;
  updated_at: string;
}

// Scoring Types
export interface ScoreBreakdown {
  skills: {
    score: number;
    weight: number;
    matched: string[];
    missing: string[];
    details: string;
  };
  experience: {
    score: number;
    weight: number;
    yearsRequired: number;
    yearsActual: number;
    relevantRoles: string[];
    details: string;
  };
  education: {
    score: number;
    weight: number;
    meetsRequirement: boolean;
    details: string;
  };
  achievements: {
    score: number;
    weight: number;
    highlights: string[];
    details: string;
  };
  softSkills: {
    score: number;
    weight: number;
    identified: string[];
    details: string;
  };
}

export interface ScoringExplanation {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendation: 'highly_recommended' | 'recommended' | 'consider' | 'not_recommended';
  recommendationText: string;
}

export interface ScoringResult {
  id: string;
  job_id: string;
  candidate_id: string;
  user_id: string;
  overall_score: number;
  scores: ScoreBreakdown;
  explanation: ScoringExplanation;
  created_at: string;
}

// API Response Types
export interface RankedCandidate {
  candidate: Candidate;
  scoring: ScoringResult;
  rank: number;
}
