import re
import sqlite3
from typing import List

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

DB_PATH = "jobs.db"

app = FastAPI(title="OneApply API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class JobCreate(BaseModel):
    title: str
    company: str
    location: str = "Remote"
    url: str = ""
    notes: str = ""


class Job(JobCreate):
    id: int


class SkillProfile(BaseModel):
    skills: List[str]


class ResumeRequest(BaseModel):
    resume_text: str
    job_title: str
    company: str
    candidate_name: str = "Candidate"


class CoverLetterResponse(BaseModel):
    cover_letter: str


class JobMatch(Job):
    match_score: int
    matched_skills: List[str]


SYNONYMS = {
    "javascript": "javascript",
    "js": "javascript",
    "reactjs": "react",
    "react": "react",
    "fastapi": "fastapi",
    "python": "python",
    "sql": "sql",
    "postgres": "sql",
    "postgresql": "sql",
    "node": "node",
    "nodejs": "node",
    "redux": "state management",
    "design": "design",
    "ux": "design",
    "ui": "design",
    "api": "api",
    "backend": "backend",
    "frontend": "frontend",
    "fullstack": "fullstack",
}


def normalize_tokens(value: str):
    if not value:
        return []

    cleaned = value.lower().replace("&", " and ")
    cleaned = re.sub(r"[^a-z0-9]+", " ", cleaned)
    words = [word for word in cleaned.split() if word]
    normalized = []

    for word in words:
        mapped = SYNONYMS.get(word, word)
        normalized.append(mapped)

    return normalized


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db_connection()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            company TEXT NOT NULL,
            location TEXT NOT NULL,
            url TEXT,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.commit()
    conn.close()


@app.on_event("startup")
def startup_event():
    init_db()


@app.get("/")
def home():
    return {"message": "Welcome to OneApply!"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/jobs", response_model=List[Job])
def get_jobs():
    conn = get_db_connection()
    rows = conn.execute(
        "SELECT id, title, company, location, url, notes FROM jobs ORDER BY id DESC"
    ).fetchall()
    conn.close()

    return [
        {
            "id": row["id"],
            "title": row["title"],
            "company": row["company"],
            "location": row["location"],
            "url": row["url"],
            "notes": row["notes"],
        }
        for row in rows
    ]


@app.post("/jobs", response_model=Job)
def create_job(job: JobCreate):
    conn = get_db_connection()
    cursor = conn.execute(
        """
        INSERT INTO jobs (title, company, location, url, notes)
        VALUES (?, ?, ?, ?, ?)
        """,
        (job.title, job.company, job.location, job.url, job.notes),
    )
    conn.commit()
    job_id = cursor.lastrowid
    conn.close()

    return {
        "id": job_id,
        "title": job.title,
        "company": job.company,
        "location": job.location,
        "url": job.url,
        "notes": job.notes,
    }


@app.post("/match", response_model=List[JobMatch])
def match_jobs(profile: SkillProfile):
    skills = []
    for skill in profile.skills:
        skills.extend(normalize_tokens(skill))

    skills = sorted(set(skills))

    if not skills:
        return []

    jobs = get_jobs()
    matched_jobs = []

    for job in jobs:
        combined_text = " ".join(
            [job["title"], job["company"], job["location"], job["notes"], job["url"]]
        )
        job_tokens = set(normalize_tokens(combined_text))
        overlap = sorted(set(skills) & job_tokens)

        if not overlap:
            continue

        score = round((len(overlap) / len(skills)) * 100)
        score = min(score, 100)

        matched_jobs.append(
            {
                "id": job["id"],
                "title": job["title"],
                "company": job["company"],
                "location": job["location"],
                "url": job["url"],
                "notes": job["notes"],
                "match_score": score,
                "matched_skills": overlap,
            }
        )

    return sorted(matched_jobs, key=lambda item: item["match_score"], reverse=True)


@app.post("/cover-letter", response_model=CoverLetterResponse)
def generate_cover_letter(request: ResumeRequest):
    if not request.resume_text or not request.resume_text.strip():
        return {"cover_letter": "Please paste your resume text before generating a cover letter."}

    keywords = extract_resume_keywords(request.resume_text)
    if not keywords:
        keywords = ["product thinking", "communication", "problem solving"]

    skill_line = ", ".join(keywords[:4])
    letter = (
        f"Dear Hiring Manager,\n\n"
        f"I am writing to express my strong interest in the {request.job_title} role at {request.company}. "
        f"My experience and skills in {skill_line} align closely with the needs of this position. "
        f"I am excited about the opportunity to contribute to a team that values clear execution, thoughtful collaboration, "
        f"and measurable impact.\n\n"
        f"In my previous work, I have focused on building practical, user-friendly solutions, improving processes, and delivering results with strong communication and ownership. "
        f"I would welcome the chance to bring that same energy and focus to {request.company}, supporting ambitious goals while continuing to learn and grow in a collaborative environment.\n\n"
        f"Thank you for your time and consideration. I would be glad to discuss how my background and motivation could support your team.\n\n"
        f"Sincerely,\n{request.candidate_name}"
    )
    return {"cover_letter": letter}


def extract_resume_keywords(text: str):
    cleaned = re.sub(r"[^a-z0-9\s]", " ", text.lower())
    words = [word for word in cleaned.split() if len(word) > 2]
    stop_words = {
        "with", "from", "that", "this", "have", "will", "your", "into", "over",
        "they", "them", "then", "than", "been", "were", "also", "what", "when",
        "where", "about", "after", "used", "work", "team", "projects", "skills",
        "resume", "experience", "career", "role", "strong", "good", "great"
    }
    keywords = []
    for word in words:
        if word not in stop_words:
            keywords.append(word)

    normalized = []
    for word in keywords:
        mapped = SYNONYMS.get(word, word)
        normalized.append(mapped)

    deduped = []
    for item in normalized:
        if item not in deduped:
            deduped.append(item)

    return deduped[:8]
