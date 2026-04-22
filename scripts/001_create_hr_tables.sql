-- AI Candidate Scoring System - Database Schema
-- Creates tables for jobs, candidates, and scoring results

-- Jobs Table (Вакансии)
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  requirements JSONB NOT NULL DEFAULT '{}',
  -- requirements: { skills: [], experience_years: number, education: string, soft_skills: [] }
  department TEXT,
  location TEXT,
  salary_range JSONB,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'closed', 'draft')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Candidates Table (Кандидаты)
CREATE TABLE IF NOT EXISTS candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  resume_url TEXT,
  resume_text TEXT,
  parsed_data JSONB NOT NULL DEFAULT '{}',
  -- parsed_data: { skills: [], experience: [], education: [], achievements: [], soft_skills: [] }
  source TEXT,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'screening', 'interview', 'offer', 'hired', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scoring Results Table (Результаты скоринга)
CREATE TABLE IF NOT EXISTS scoring_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  overall_score NUMERIC(5,2) NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
  scores JSONB NOT NULL DEFAULT '{}',
  -- scores: { skills: number, experience: number, education: number, achievements: number, soft_skills: number }
  explanation JSONB NOT NULL DEFAULT '{}',
  -- explanation: { strengths: [], weaknesses: [], recommendation: string }
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(job_id, candidate_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_candidates_user_id ON candidates(user_id);
CREATE INDEX IF NOT EXISTS idx_candidates_status ON candidates(status);
CREATE INDEX IF NOT EXISTS idx_scoring_results_job_id ON scoring_results(job_id);
CREATE INDEX IF NOT EXISTS idx_scoring_results_candidate_id ON scoring_results(candidate_id);
CREATE INDEX IF NOT EXISTS idx_scoring_results_user_id ON scoring_results(user_id);

-- Enable Row Level Security
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoring_results ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Jobs
DROP POLICY IF EXISTS "jobs_select_own" ON jobs;
CREATE POLICY "jobs_select_own" ON jobs FOR SELECT USING (true);

DROP POLICY IF EXISTS "jobs_insert_own" ON jobs;
CREATE POLICY "jobs_insert_own" ON jobs FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "jobs_update_own" ON jobs;
CREATE POLICY "jobs_update_own" ON jobs FOR UPDATE USING (true);

DROP POLICY IF EXISTS "jobs_delete_own" ON jobs;
CREATE POLICY "jobs_delete_own" ON jobs FOR DELETE USING (true);

-- RLS Policies for Candidates
DROP POLICY IF EXISTS "candidates_select_own" ON candidates;
CREATE POLICY "candidates_select_own" ON candidates FOR SELECT USING (true);

DROP POLICY IF EXISTS "candidates_insert_own" ON candidates;
CREATE POLICY "candidates_insert_own" ON candidates FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "candidates_update_own" ON candidates;
CREATE POLICY "candidates_update_own" ON candidates FOR UPDATE USING (true);

DROP POLICY IF EXISTS "candidates_delete_own" ON candidates;
CREATE POLICY "candidates_delete_own" ON candidates FOR DELETE USING (true);

-- RLS Policies for Scoring Results
DROP POLICY IF EXISTS "scoring_select_own" ON scoring_results;
CREATE POLICY "scoring_select_own" ON scoring_results FOR SELECT USING (true);

DROP POLICY IF EXISTS "scoring_insert_own" ON scoring_results;
CREATE POLICY "scoring_insert_own" ON scoring_results FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "scoring_update_own" ON scoring_results;
CREATE POLICY "scoring_update_own" ON scoring_results FOR UPDATE USING (true);

DROP POLICY IF EXISTS "scoring_delete_own" ON scoring_results;
CREATE POLICY "scoring_delete_own" ON scoring_results FOR DELETE USING (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for auto-updating updated_at
DROP TRIGGER IF EXISTS update_jobs_updated_at ON jobs;
CREATE TRIGGER update_jobs_updated_at
    BEFORE UPDATE ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_candidates_updated_at ON candidates;
CREATE TRIGGER update_candidates_updated_at
    BEFORE UPDATE ON candidates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
