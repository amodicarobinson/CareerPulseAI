import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

/**
 * Helper to handle retries with exponential backoff for Gemini API calls.
 * This directly addresses the RESOURCE_EXHAUSTED (429) errors.
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 4, baseDelay = 3000): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const errObj = error?.error || error;
      const isRateLimit = 
        errObj?.message?.includes("429") || 
        errObj?.status === "RESOURCE_EXHAUSTED" || 
        errObj?.code === 429 || 
        errObj?.message?.includes("quota") ||
        error?.message?.includes("429") ||
        error?.message?.includes("quota") ||
        error?.message?.includes("RESOURCE_EXHAUSTED");
        
      const isTransientError = 
        errObj?.code === 500 || 
        errObj?.code === 503 ||
        error?.message?.includes("Rpc failed") ||
        errObj?.message?.includes("Rpc failed") ||
        error?.message?.includes("500") ||
        error?.message?.includes("503");
        
      if ((isRateLimit || isTransientError) && i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i) + Math.random() * 2000;
        console.warn(`Gemini API error (rate limit or transient). Retrying in ${Math.round(delay)}ms... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export async function analyzeResume(resumeText: string) {
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze this resume and extract key information in JSON format.
      Resume: ${resumeText}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            skills: { type: Type.ARRAY, items: { type: Type.STRING } },
            roles: { type: Type.ARRAY, items: { type: Type.STRING } },
            summary: { type: Type.STRING }
          },
          required: ["skills", "roles", "summary"]
        }
      }
    });

    return JSON.parse(response.text || "{}");
  });
}

export async function findJobs(userProfile: any) {
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Act as an expert career matcher with access to live web data. Use Google Search to find 3 REAL, LIVE job opportunities that are currently accepting applications and match the user's career profile.
      
      SEARCH INSTRUCTIONS:
      - Search for roles on LinkedIn, Greenhouse.io, Lever.co, and company career pages.
      - Ensure the "url" property points to the actual job posting or application page.
      - Verify that the jobs match the user's skills and status.
      - For each job, extract a "fullDescription" which covers the primary responsibilities, technical requirements, and interesting mission details.
      
      MATCHING LOGIC:
      - Prioritize jobs that explicitly require the user's top "skills".
      - Focus on the "roles" identified in the profile analysis.
      - Use the seniority level from "resumeText" if available.
      
      CRITICAL LOCATION CONSTRAINTS:
      - If the job is located in Colorado (CO), prefer Hybrid roles, especially in Colorado Springs.
      - If the job is located ANYWHERE ELSE outside of Colorado, it MUST be 100% REMOTE.
      - Do NOT suggest on-site or hybrid roles for locations outside of Colorado.
      
      GOVERNMENT & CLEARANCE EXCLUSIONS:
      - If "excludeGov" is true, you MUST NOT suggest any government jobs (federal, state, local).
      - You MUST NOT suggest jobs that require any level of security clearance (Public Trust, Secret, TS/SCI, etc.).
      
      FORMAT INSTRUCTIONS:
      You MUST return the output as a valid JSON array of objects. Do not include any markdown fences or additional text outside of the JSON array.
      
      Each object in the array must strictly contain these fields:
      "title" (string), "company" (string), "location" (string), "description" (string, a brief 2-sentence summary), "fullDescription" (string, at least 2 paragraphs of responsibilities and requirements), "url" (string, the live job post URL), "matchScore" (number), "matchReason" (string), "salary" (string), "postedDate" (string, ISO date), "companySize" (string), "industry" (string), "technologies" (array of strings), "jobType" (string).

      Profile: ${JSON.stringify({
        skills: userProfile.skills,
        roles: userProfile.preferences?.roles || [],
        summary: userProfile.summary,
        locations: userProfile.preferences?.locations || [],
        industries: userProfile.preferences?.industries || [],
        minSalary: userProfile.preferences?.minSalary,
        companySize: userProfile.preferences?.companySize,
        technologies: userProfile.preferences?.technologies || [],
        jobType: userProfile.preferences?.jobType,
        excludeGov: userProfile.preferences?.excludeGov || false
      })}`,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });

    const rawText = response.text || "[]";
    const jsonStr = rawText.replace(/```(json)?/g, '').trim();
    return JSON.parse(jsonStr);
  });
}

export async function verifyJobStatus(job: any): Promise<boolean> {
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Verify if the following job is still open and actively posted using Google Search.
      
      Job Title: ${job.title}
      Company: ${job.company}
      URL: ${job.url}
      
      Search to verify if this specific job at this company is still actively accepting applications or posted on their site or any major job board.
      
      Respond with a JSON object: {"isOpen": true} if it's still open, or {"isOpen": false} if it's closed, unlisted, or 404s.`,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isOpen: { type: Type.BOOLEAN }
          },
          required: ["isOpen"]
        }
      }
    });

    try {
      const rawText = response.text || "{\"isOpen\": true}";
      const jsonStr = rawText.replace(/```(json)?/g, '').trim();
      const result = JSON.parse(jsonStr);
      return result.isOpen !== false;
    } catch (e) {
      return true;
    }
  });
}

export async function generateCoverLetter(resume: string, jobInfo: any) {
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are an expert career coach and copywriter. Generate a highly tailored, engaging, and professional cover letter.
      
      INSTRUCTIONS:
      1. Hook the reader immediately. Do not use generic openings like "I am writing to apply for...". Instead, start with a strong statement about what draws you to the company's mission or a key relevant achievement.
      2. Connect the dots. Explicitly map 2-3 specific achievements from the Resume to the core requirements of the Job Description. Show, don't just tell.
      3. Keep it concise. No more than 3-4 paragraphs. Value the hiring manager's time.
      4. Avoid cliches like "dynamic team player" or "detail-oriented". Use action verbs.
      5. Include a specific call to action in the closing paragraph.
      6. Output plain text suitable for copying directly into an application form or email. Do NOT include placeholder brackets like [Your Name] if the information is missing; structure the letter so it reads naturally without them, or infer from the resume.

      Job Context: ${JSON.stringify(jobInfo)}
      Resume/Applicant Context: ${resume}`,
    });

    return response.text;
  });
}

export async function tailorResume(resume: string, jobInfo: any) {
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are an expert resume optimizer. Analyze my resume and the job description, then generate an OPTIMIZED version of my resume text.
      
      INSTRUCTIONS:
      - Use my original resume content but rephrase bullet points to emphasize relevant experience.
      - Match keywords from the job description naturally.
      - Keep the output as a clean, text-based resume (no markdown formatting, just plain professional structure).
      - Ensure the tone is confident and professional.

      Resume: ${resume}
      Job: ${JSON.stringify(jobInfo)}`,
    });

    return response.text;
  });
}
