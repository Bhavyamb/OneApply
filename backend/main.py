import html as html_lib
import os
import re
from typing import List
from urllib.parse import urlparse

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pymongo import MongoClient, DESCENDING

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "OneApply")

client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
db = client[MONGO_DB_NAME]
jobs_collection = db["jobs"]

allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,https://bhavyamb.github.io",
    ).split(",")
    if origin.strip()
]

app = FastAPI(title="OneApply API")
app.add_middleware(
   CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"https://.*\.github\.io",
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
    id: str


class SkillProfile(BaseModel):
    skills: List[str]


class JobImportRequest(BaseModel):
    url: str


class JobImportResponse(BaseModel):
    title: str
    company: str
    location: str
    url: str
    notes: str


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


def clean_text(value: str) -> str:
    if not value:
        return ""
    value = html_lib.unescape(value)
    value = re.sub(r"<[^>]+>", " ", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def get_site_name(url: str) -> str:
    domain = urlparse(url).netloc.lower().replace("www.", "")
    if "linkedin" in domain:
        return "LinkedIn"
    if "indeed" in domain:
        return "Indeed"
    if "naukri" in domain:
        return "Naukri"
    return domain.split(".")[0].replace("-", " ").title() if domain else "Company"


def extract_job_details_from_html(html_content: str, source_url: str) -> dict:
    text = html_lib.unescape(html_content or "")

    title = ""
    title_patterns = [
        r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+name=["\']twitter:title["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']title["\']',
    ]
    
    title = title or "Job Opportunity"
    company = company or get_site_name(source_url)
    return {
        "title": title.replace("- LinkedIn", "").replace("- Indeed", "").strip(),
        "company": company,
        "location": location,
        "url": source_url,
        "notes": f"Imported from {source_url}",
    }


def normalize_tokens(value: str) -> List[str]:
    if not value:
        return []
    cleaned = value.lower().replace("&", " and ")
    cleaned = re.sub(r"[^a-z0-9]+", " ", cleaned)
    words = [word for word in cleaned.split() if word]
    normalized = []
    for word in words:
        mapped = SYNONYMS.get(word, word)
        # Some synonyms contain spaces, so split them into tokens too.
        normalized.extend(mapped.split())
    return normalized


def serialize_job(doc: dict) -> dict:
    job = dict(doc)
    job["id"] = str(job.pop("_id", job.get("id", "")))
    job.setdefault("title", "")
    job.setdefault("company", "")
    job.setdefault("location", "Remote")
    job.setdefault("url", "")
    job.setdefault("notes", "")
    return job


def init_db() -> None:
    try:
        client.admin.command("ping")
        jobs_collection.create_index("title")
        jobs_collection.create_index("company")
    except Exception as exc:
        # Keep startup available; database errors will be visible on endpoint use.
        print(f"Database initialization warning: {exc}")


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
    rows = list(jobs_collection.find({}).sort("_id", DESCENDING))
    return [serialize_job(row) for row in rows]


@app.post("/jobs", response_model=Job)
def create_job(job: JobCreate):
    payload = {
        "title": job.title,
        "company": job.company,
        "location": job.location,
        "url": job.url,
        "notes": job.notes,
    }
    result = jobs_collection.insert_one(payload)
    payload["id"] = str(result.inserted_id)
    return payload


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
            str(job.get(field, "") or "")
            for field in ("title", "company", "location", "notes", "url")
        )
        job_tokens = set(normalize_tokens(combined_text))
        overlap = sorted(set(skills) & job_tokens)
        if not overlap:
            continue

        score = min(round((len(overlap) / len(skills)) * 100), 100)
        matched_jobs.append(
            {
                "id": str(job.get("id", "")),
                "title": job.get("title", ""),
                "company": job.get("company", ""),
                "location": job.get("location", "Remote"),
                "url": job.get("url", ""),
                "notes": job.get("notes", ""),
                "match_score": score,
                "matched_skills": overlap,
            }
        )

    return sorted(matched_jobs, key=lambda item: item["match_score"], reverse=True)


@app.post("/job-import", response_model=JobImportResponse)
def import_job_from_url(payload: JobImportRequest):
    url = payload.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="Job URL is required")
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(
            status_code=400,
            detail="Please provide a valid HTTP or HTTPS job URL",
        )

    try:
        response = requests.get(
            url,
            timeout=20,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0 Safari/537.36"
                ),
                "Accept-Language": "en-US,en;q=0.9",
            },
        )
        response.raise_for_status()
    except requests.RequestException:
        return {
            "title": "Job Opportunity",
            "company": get_site_name(url),
            "location": "Remote",
            "url": url,
            "notes": f"Imported from {url}",
        }

    return extract_job_details_from_html(response.text, url)


@app.post("/cover-letter", response_model=CoverLetterResponse)
def generate_cover_letter(request: ResumeRequest):
    if not request.resume_text or not request.resume_text.strip():
        return {
            "cover_letter": "Please paste your resume text before generating a cover letter."
        }

    keywords = extract_resume_keywords(request.resume_text)
    if not keywords:
        keywords = ["product thinking", "communication", "problem solving"]

    skill_line = ", ".join(keywords[:4])
    letter = (
        "Dear Hiring Manager,\n\n"
        f"I am writing to express my strong interest in the {request.job_title} role at {request.company}. "
        f"My experience and skills in {skill_line} align closely with the needs of this position. "
        "I am excited about the opportunity to contribute to a team that values clear execution, thoughtful collaboration, "
        "and measurable impact.\n\n"
        "In my previous work, I have focused on building practical, user-friendly solutions, improving processes, and delivering results with strong communication and ownership. "
        f"I would welcome the chance to bring that same energy and focus to {request.company}, supporting ambitious goals while continuing to learn and grow in a collaborative environment.\n\n"
        "Thank you for your time and consideration. I would be glad to discuss how my background and motivation could support your team.\n\n"
        f"Sincerely,\n{request.candidate_name}"
    )
    return {"cover_letter": letter}


def extract_resume_keywords(text: str) -> List[str]:
    cleaned = re.sub(r"[^a-z0-9\s]", " ", text.lower())
    words = [word for word in cleaned.split() if len(word) > 2]
    stop_words = {
        "with", "from", "that", "this", "have", "will", "your", "into", "over",
        "they", "them", "then", "than", "been", "were", "also", "what", "when",
        "where", "about", "after", "used", "work", "team", "projects", "skills",
        "resume", "experience", "career", "role", "strong", "good", "great",
    }
    keywords = [word for word in words if word not in stop_words]
    normalized = []
    for word in keywords:
        normalized.extend(SYNONYMS.get(word, word).split())

    deduped = []
    for item in normalized:
        if item not in deduped:
            deduped.append(item)
    return deduped[:8]
