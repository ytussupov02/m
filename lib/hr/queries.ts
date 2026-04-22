import { createClient } from '@/lib/supabase/server';
import type {
  Job,
  JobRequirements,
  Candidate,
  ParsedCandidateData,
  ScoringResult,
  ScoreBreakdown,
  ScoringExplanation,
} from './types';

// ============== Jobs ==============

export async function createJob(data: {
  userId: string;
  title: string;
  description: string;
  requirements: JobRequirements;
  department?: string;
  location?: string;
  salaryRange?: { min?: number; max?: number; currency?: string };
  status?: 'active' | 'closed' | 'draft';
}): Promise<Job> {
  const supabase = await createClient();

  const { data: job, error } = await supabase
    .from('jobs')
    .insert({
      user_id: data.userId,
      title: data.title,
      description: data.description,
      requirements: data.requirements,
      department: data.department,
      location: data.location,
      salary_range: data.salaryRange,
      status: data.status || 'active',
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create job: ${error.message}`);
  return job as Job;
}

export async function getJob(jobId: string): Promise<Job | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to get job: ${error.message}`);
  }
  return data as Job;
}

export async function listJobs(userId: string, status?: string): Promise<Job[]> {
  const supabase = await createClient();

  let query = supabase
    .from('jobs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) throw new Error(`Failed to list jobs: ${error.message}`);
  return (data || []) as Job[];
}

export async function updateJob(
  jobId: string,
  updates: Partial<Omit<Job, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
): Promise<Job> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('jobs')
    .update(updates)
    .eq('id', jobId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update job: ${error.message}`);
  return data as Job;
}

// ============== Candidates ==============

export async function createCandidate(data: {
  userId: string;
  name: string;
  email?: string;
  phone?: string;
  resumeUrl?: string;
  resumeText?: string;
  parsedData: ParsedCandidateData;
  source?: string;
}): Promise<Candidate> {
  const supabase = await createClient();

  const { data: candidate, error } = await supabase
    .from('candidates')
    .insert({
      user_id: data.userId,
      name: data.name,
      email: data.email,
      phone: data.phone,
      resume_url: data.resumeUrl,
      resume_text: data.resumeText,
      parsed_data: data.parsedData,
      source: data.source,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create candidate: ${error.message}`);
  return candidate as Candidate;
}

export async function getCandidate(candidateId: string): Promise<Candidate | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('candidates')
    .select('*')
    .eq('id', candidateId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to get candidate: ${error.message}`);
  }
  return data as Candidate;
}

export async function listCandidates(
  userId: string,
  status?: string
): Promise<Candidate[]> {
  const supabase = await createClient();

  let query = supabase
    .from('candidates')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) throw new Error(`Failed to list candidates: ${error.message}`);
  return (data || []) as Candidate[];
}

export async function updateCandidate(
  candidateId: string,
  updates: Partial<Omit<Candidate, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
): Promise<Candidate> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('candidates')
    .update(updates)
    .eq('id', candidateId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update candidate: ${error.message}`);
  return data as Candidate;
}

// ============== Scoring Results ==============

export async function saveScoringResult(data: {
  jobId: string;
  candidateId: string;
  userId: string;
  overallScore: number;
  scores: ScoreBreakdown;
  explanation: ScoringExplanation;
}): Promise<ScoringResult> {
  const supabase = await createClient();

  const { data: result, error } = await supabase
    .from('scoring_results')
    .upsert(
      {
        job_id: data.jobId,
        candidate_id: data.candidateId,
        user_id: data.userId,
        overall_score: data.overallScore,
        scores: data.scores,
        explanation: data.explanation,
      },
      { onConflict: 'job_id,candidate_id' }
    )
    .select()
    .single();

  if (error) throw new Error(`Failed to save scoring result: ${error.message}`);
  return result as ScoringResult;
}

export async function getScoringResult(
  jobId: string,
  candidateId: string
): Promise<ScoringResult | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('scoring_results')
    .select('*')
    .eq('job_id', jobId)
    .eq('candidate_id', candidateId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to get scoring result: ${error.message}`);
  }
  return data as ScoringResult;
}

export async function getScoringResultsForJob(
  jobId: string
): Promise<ScoringResult[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('scoring_results')
    .select('*')
    .eq('job_id', jobId)
    .order('overall_score', { ascending: false });

  if (error) throw new Error(`Failed to get scoring results: ${error.message}`);
  return (data || []) as ScoringResult[];
}

export async function getRankedCandidatesForJob(
  jobId: string
): Promise<{ candidate: Candidate; scoring: ScoringResult; rank: number }[]> {
  const supabase = await createClient();

  const { data: scoringResults, error: scoringError } = await supabase
    .from('scoring_results')
    .select('*')
    .eq('job_id', jobId)
    .order('overall_score', { ascending: false });

  if (scoringError) throw new Error(`Failed to get rankings: ${scoringError.message}`);

  if (!scoringResults || scoringResults.length === 0) {
    return [];
  }

  const candidateIds = scoringResults.map((r) => r.candidate_id);
  
  const { data: candidates, error: candidatesError } = await supabase
    .from('candidates')
    .select('*')
    .in('id', candidateIds);

  if (candidatesError) throw new Error(`Failed to get candidates: ${candidatesError.message}`);

  const candidateMap = new Map(candidates?.map((c) => [c.id, c]) || []);

  return scoringResults.map((scoring, index) => ({
    candidate: candidateMap.get(scoring.candidate_id) as Candidate,
    scoring: scoring as ScoringResult,
    rank: index + 1,
  })).filter((r) => r.candidate);
}
