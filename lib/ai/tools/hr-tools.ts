import { tool, type UIMessageStreamWriter, generateText } from "ai";
import type { Session } from "next-auth";
import { z } from "zod";
import {
  createJob,
  createCandidate,
  getJob,
  getCandidate,
  listJobs,
  listCandidates,
  saveScoringResult,
  getRankedCandidatesForJob,
} from "@/lib/hr/queries";
import { parseResumeFromUrl } from "@/lib/hr/resume-parser";
import type {
  JobRequirements,
  ParsedCandidateData,
  ScoreBreakdown,
  ScoringExplanation,
} from "@/lib/hr/types";
import type { ChatMessage } from "@/lib/types";
import { getLanguageModel } from "@/lib/ai/providers";

type HRToolProps = {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
  modelId: string;
};

// ============== Create Job Tool ==============
export const createJobTool = ({ session }: HRToolProps) =>
  tool({
    description:
      "Create a new job posting/vacancy with AI-extracted requirements. Use this when user wants to add a new position for candidate matching.",
    inputSchema: z.object({
      title: z.string().describe("Job title (e.g., 'Senior Frontend Developer')"),
      description: z.string().describe("Full job description text"),
      department: z.string().optional().describe("Department name"),
      location: z.string().optional().describe("Job location"),
      salaryMin: z.number().optional().describe("Minimum salary"),
      salaryMax: z.number().optional().describe("Maximum salary"),
      currency: z.string().optional().describe("Salary currency (e.g., USD, EUR, KZT)"),
    }),
    execute: async ({ title, description, department, location, salaryMin, salaryMax, currency }) => {
      // Use AI to extract structured requirements from description
      const extractionResult = await generateText({
        model: getLanguageModel("openai/gpt-4o-mini"),
        prompt: `Analyze the following job description and extract structured requirements.
        
Job Title: ${title}
Job Description: ${description}

Extract and return a JSON object with:
- skills: array of required technical skills
- experience: { min: number of years (minimum), max: optional number of years (maximum), description: string }
- education: { level: "high_school" | "bachelor" | "master" | "phd" | "any", fields: optional array of relevant fields }
- languages: optional array of { language: string, level: "basic" | "intermediate" | "advanced" | "native" }
- certifications: optional array of certification names
- softSkills: optional array of soft skills

Return ONLY valid JSON, no markdown or explanations.`,
      });

      let requirements: JobRequirements;
      try {
        requirements = JSON.parse(extractionResult.text);
      } catch {
        // Default requirements if parsing fails
        requirements = {
          skills: [],
          experience: { min: 0, description: description.slice(0, 200) },
        };
      }

      const job = await createJob({
        userId: session.user!.id,
        title,
        description,
        requirements,
        department,
        location,
        salaryRange: salaryMin || salaryMax ? { min: salaryMin, max: salaryMax, currency } : undefined,
      });

      return {
        success: true,
        job: {
          id: job.id,
          title: job.title,
          status: job.status,
          requirements: job.requirements,
        },
        message: `Job "${title}" created successfully with ${requirements.skills?.length || 0} required skills extracted.`,
      };
    },
  });

// ============== Analyze CV Tool ==============
export const analyzeCVTool = ({ session }: HRToolProps) =>
  tool({
    description:
      "Analyze and parse a candidate's resume/CV from uploaded file URL. Extracts skills, experience, education, and other relevant information.",
    inputSchema: z.object({
      fileUrl: z.string().describe("URL of the uploaded resume file (PDF or DOCX)"),
      candidateName: z.string().optional().describe("Candidate name if known"),
      source: z.string().optional().describe("Source of the candidate (e.g., 'LinkedIn', 'HeadHunter', 'Referral')"),
    }),
    execute: async ({ fileUrl, candidateName, source }) => {
      // Parse the resume file
      const parsedResume = await parseResumeFromUrl(fileUrl);

      // Use AI to extract structured data from resume text
      const extractionResult = await generateText({
        model: getLanguageModel("openai/gpt-4o-mini"),
        prompt: `Analyze the following resume text and extract structured information.

Resume Text:
${parsedResume.text.slice(0, 8000)}

Extract and return a JSON object with:
- name: candidate's full name
- email: email address if found
- phone: phone number if found
- skills: array of all technical and professional skills mentioned
- experience: array of { company: string, position: string, duration: string, years: estimated number of years, description: brief description }
- education: array of { institution: string, degree: string, field: optional field of study, year: optional graduation year }
- languages: optional array of { language: string, level: estimated level }
- certifications: optional array of certification names
- achievements: optional array of notable achievements
- summary: brief professional summary (2-3 sentences)
- totalYearsExperience: estimated total years of professional experience

Return ONLY valid JSON, no markdown or explanations.`,
      });

      let parsedData: ParsedCandidateData;
      try {
        parsedData = JSON.parse(extractionResult.text);
      } catch {
        parsedData = {
          skills: [],
          experience: [],
          education: [],
          summary: parsedResume.text.slice(0, 500),
        };
      }

      // Use provided name or extracted name
      const name = candidateName || parsedData.name || "Unknown Candidate";

      const candidate = await createCandidate({
        userId: session.user!.id,
        name,
        email: parsedData.email,
        phone: parsedData.phone,
        resumeUrl: fileUrl,
        resumeText: parsedResume.text,
        parsedData,
        source,
      });

      return {
        success: true,
        candidate: {
          id: candidate.id,
          name: candidate.name,
          email: candidate.email,
          skills: parsedData.skills,
          totalYearsExperience: parsedData.totalYearsExperience,
          educationCount: parsedData.education?.length || 0,
          experienceCount: parsedData.experience?.length || 0,
        },
        summary: parsedData.summary,
        message: `Resume analyzed successfully. Found ${parsedData.skills?.length || 0} skills, ${parsedData.experience?.length || 0} work experiences, ${parsedData.education?.length || 0} education entries.`,
      };
    },
  });

// ============== Score Candidate Tool ==============
export const scoreCandidateTool = ({ session }: HRToolProps) =>
  tool({
    description:
      "Score a candidate against a specific job posting. Calculates comprehensive match score with detailed breakdown and explanation.",
    inputSchema: z.object({
      jobId: z.string().describe("ID of the job to match against"),
      candidateId: z.string().describe("ID of the candidate to score"),
    }),
    execute: async ({ jobId, candidateId }) => {
      const [job, candidate] = await Promise.all([
        getJob(jobId),
        getCandidate(candidateId),
      ]);

      if (!job) {
        return { success: false, error: "Job not found" };
      }
      if (!candidate) {
        return { success: false, error: "Candidate not found" };
      }

      // Use AI to perform comprehensive scoring
      const scoringResult = await generateText({
        model: getLanguageModel("openai/gpt-4o"),
        prompt: `You are an expert HR analyst. Score this candidate against the job requirements.

JOB REQUIREMENTS:
Title: ${job.title}
Description: ${job.description}
Required Skills: ${JSON.stringify(job.requirements.skills)}
Required Experience: ${JSON.stringify(job.requirements.experience)}
Required Education: ${JSON.stringify(job.requirements.education)}
Soft Skills: ${JSON.stringify(job.requirements.softSkills)}

CANDIDATE PROFILE:
Name: ${candidate.name}
Skills: ${JSON.stringify(candidate.parsed_data.skills)}
Experience: ${JSON.stringify(candidate.parsed_data.experience)}
Total Years: ${candidate.parsed_data.totalYearsExperience || 'Unknown'}
Education: ${JSON.stringify(candidate.parsed_data.education)}
Achievements: ${JSON.stringify(candidate.parsed_data.achievements)}
Summary: ${candidate.parsed_data.summary}

Provide a detailed scoring analysis as JSON:
{
  "scores": {
    "skills": {
      "score": 0-100,
      "weight": 0.30,
      "matched": ["list of matched skills"],
      "missing": ["list of missing required skills"],
      "details": "explanation"
    },
    "experience": {
      "score": 0-100,
      "weight": 0.25,
      "yearsRequired": number,
      "yearsActual": number,
      "relevantRoles": ["relevant positions"],
      "details": "explanation"
    },
    "education": {
      "score": 0-100,
      "weight": 0.15,
      "meetsRequirement": boolean,
      "details": "explanation"
    },
    "achievements": {
      "score": 0-100,
      "weight": 0.15,
      "highlights": ["notable achievements"],
      "details": "explanation"
    },
    "softSkills": {
      "score": 0-100,
      "weight": 0.15,
      "identified": ["identified soft skills"],
      "details": "explanation"
    }
  },
  "explanation": {
    "summary": "2-3 sentence overall assessment",
    "strengths": ["list of 3-5 key strengths"],
    "weaknesses": ["list of areas for improvement"],
    "recommendation": "highly_recommended" | "recommended" | "consider" | "not_recommended",
    "recommendationText": "detailed recommendation text"
  }
}

Return ONLY valid JSON.`,
      });

      let scoringData: { scores: ScoreBreakdown; explanation: ScoringExplanation };
      try {
        scoringData = JSON.parse(scoringResult.text);
      } catch {
        return { success: false, error: "Failed to parse scoring result" };
      }

      // Calculate overall score
      const overallScore = 
        scoringData.scores.skills.score * scoringData.scores.skills.weight +
        scoringData.scores.experience.score * scoringData.scores.experience.weight +
        scoringData.scores.education.score * scoringData.scores.education.weight +
        scoringData.scores.achievements.score * scoringData.scores.achievements.weight +
        scoringData.scores.softSkills.score * scoringData.scores.softSkills.weight;

      // Save scoring result
      const result = await saveScoringResult({
        jobId,
        candidateId,
        userId: session.user!.id,
        overallScore: Math.round(overallScore * 100) / 100,
        scores: scoringData.scores,
        explanation: scoringData.explanation,
      });

      return {
        success: true,
        scoring: {
          overallScore: result.overall_score,
          recommendation: scoringData.explanation.recommendation,
          summary: scoringData.explanation.summary,
          strengths: scoringData.explanation.strengths,
          weaknesses: scoringData.explanation.weaknesses,
          skillsMatch: `${scoringData.scores.skills.matched.length}/${scoringData.scores.skills.matched.length + scoringData.scores.skills.missing.length}`,
        },
        message: `Candidate scored ${result.overall_score}/100. Recommendation: ${scoringData.explanation.recommendationText}`,
      };
    },
  });

// ============== Match Candidates Tool ==============
export const matchCandidatesTool = ({ session }: HRToolProps) =>
  tool({
    description:
      "Get ranked list of all candidates matched against a specific job. Shows top candidates with their scores and recommendations.",
    inputSchema: z.object({
      jobId: z.string().describe("ID of the job to get candidate rankings for"),
      limit: z.number().optional().describe("Maximum number of candidates to return (default: 10)"),
    }),
    execute: async ({ jobId, limit = 10 }) => {
      const job = await getJob(jobId);
      if (!job) {
        return { success: false, error: "Job not found" };
      }

      const rankedCandidates = await getRankedCandidatesForJob(jobId);
      const topCandidates = rankedCandidates.slice(0, limit);

      if (topCandidates.length === 0) {
        return {
          success: true,
          job: { id: job.id, title: job.title },
          candidates: [],
          message: "No candidates have been scored for this job yet. Use the scoreCandidate tool to score candidates first.",
        };
      }

      return {
        success: true,
        job: { id: job.id, title: job.title },
        totalCandidates: rankedCandidates.length,
        candidates: topCandidates.map((rc) => ({
          rank: rc.rank,
          candidateId: rc.candidate.id,
          name: rc.candidate.name,
          email: rc.candidate.email,
          score: rc.scoring.overall_score,
          recommendation: rc.scoring.explanation.recommendation,
          summary: rc.scoring.explanation.summary,
          strengths: rc.scoring.explanation.strengths.slice(0, 3),
        })),
        message: `Found ${rankedCandidates.length} scored candidates for "${job.title}". Top candidate: ${topCandidates[0]?.candidate.name} with score ${topCandidates[0]?.scoring.overall_score}/100.`,
      };
    },
  });

// ============== List Jobs Tool ==============
export const listJobsTool = ({ session }: HRToolProps) =>
  tool({
    description: "List all job postings for the current user. Can filter by status.",
    inputSchema: z.object({
      status: z.enum(["active", "closed", "draft"]).optional().describe("Filter by job status"),
    }),
    execute: async ({ status }) => {
      const jobs = await listJobs(session.user!.id, status);

      return {
        success: true,
        totalJobs: jobs.length,
        jobs: jobs.map((job) => ({
          id: job.id,
          title: job.title,
          department: job.department,
          location: job.location,
          status: job.status,
          skillsCount: job.requirements.skills?.length || 0,
          createdAt: job.created_at,
        })),
        message: jobs.length > 0 
          ? `Found ${jobs.length} job(s)${status ? ` with status "${status}"` : ""}.`
          : "No jobs found. Create a job posting first using createJob.",
      };
    },
  });

// ============== Get Candidate Details Tool ==============
export const getCandidateDetailsTool = ({ session }: HRToolProps) =>
  tool({
    description: "Get detailed information about a specific candidate including parsed resume data.",
    inputSchema: z.object({
      candidateId: z.string().describe("ID of the candidate to retrieve"),
    }),
    execute: async ({ candidateId }) => {
      const candidate = await getCandidate(candidateId);

      if (!candidate) {
        return { success: false, error: "Candidate not found" };
      }

      return {
        success: true,
        candidate: {
          id: candidate.id,
          name: candidate.name,
          email: candidate.email,
          phone: candidate.phone,
          status: candidate.status,
          source: candidate.source,
          skills: candidate.parsed_data.skills,
          totalYearsExperience: candidate.parsed_data.totalYearsExperience,
          experience: candidate.parsed_data.experience,
          education: candidate.parsed_data.education,
          languages: candidate.parsed_data.languages,
          certifications: candidate.parsed_data.certifications,
          achievements: candidate.parsed_data.achievements,
          summary: candidate.parsed_data.summary,
          createdAt: candidate.created_at,
        },
        message: `Retrieved details for ${candidate.name}.`,
      };
    },
  });

// ============== List Candidates Tool ==============
export const listCandidatesTool = ({ session }: HRToolProps) =>
  tool({
    description: "List all candidates in the system. Can filter by status.",
    inputSchema: z.object({
      status: z
        .enum(["new", "screening", "interview", "offer", "hired", "rejected"])
        .optional()
        .describe("Filter by candidate status"),
    }),
    execute: async ({ status }) => {
      const candidates = await listCandidates(session.user!.id, status);

      return {
        success: true,
        totalCandidates: candidates.length,
        candidates: candidates.map((c) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          status: c.status,
          source: c.source,
          skillsCount: c.parsed_data.skills?.length || 0,
          totalYearsExperience: c.parsed_data.totalYearsExperience,
          createdAt: c.created_at,
        })),
        message: candidates.length > 0
          ? `Found ${candidates.length} candidate(s)${status ? ` with status "${status}"` : ""}.`
          : "No candidates found. Analyze a resume first using analyzeCV.",
      };
    },
  });
