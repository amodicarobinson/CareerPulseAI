# CareerPulse AI - Development Guidelines

## Purpose
An AI-powered job application assistant. It uses Gemini to analyze resumes, find matching jobs, and track applications.

## Key Features
- **Daily Scan**: Uses Gemini (`findJobs`) to simulate finding new roles.
- **Resume Intel**: Uses Gemini (`analyzeResume`) to extract skills and roles from unstructured text.
- **Tailored Matching**: Every job has a match score and AI-generated reasoning.

## Tech Stack
- **Frontend**: React, Tailwind CSS, Motion.
- **Backend/Storage**: Firebase Auth & Firestore.
- **AI**: @google/genai (Gemini 1.5 Flash).

## Security
- Firestore rules restrict access to user-owned data only.
- PII is protected by `isOwner` checks.
