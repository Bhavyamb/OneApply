import os
import re
from datetime import datetime, timezone
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pymongo import MongoClient
from pymongo.errors import PyMongoError
from bson import ObjectId
from pypdf import PdfReader
from io import BytesIO

load_dotenv()

app = FastAPI(title="OneApply API", version="1.0.0")

# Frontend development and deployed website.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://bhavyamb.github.io",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add MONGODB_URI (or MONGO_URI) to your backend .env file
# and to your Render environment variables.
MONGO_URI = (
    os.getenv("MONGODB_URI")
    or os.getenv("MONGO_URI")
    or os.getenv("MONGO_URL")
)

MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "OneApply")

if not MONGO_URI:
    raise RuntimeError(
        "MongoDB connection string is missing. "
        "Set MONGODB_URI in your .env file and Render environment."
    )

client = MongoClient(
    MONGO_URI,
    serverSelectionTimeoutMS=10000,
)

db = client[MONGO_DB_NAME]
jobs_collection = db["jobs"]
resumes_collection = db["resumes"]


# -------------------- MODELS --------------------

class JobCreate(BaseModel):
    title: str
    company: str = ""
    location: str = ""
    description: str = ""
    skills: list[str] = Field(default_factory=list)
    url: str = ""


class MatchRequest(BaseModel):
    resume_text: str = ""
    skills: list[str] = Field(default_factory=list)


class ResumeRequest(BaseModel):
    resume_text: str = ""
    job_title: str
    company: str = ""
    job_description: str = ""


class ResumeSaveRequest(BaseModel):
    name: str = ""
    email: str = ""
    phone: str = ""
    location: str = ""
    summary: str = ""
    education: str = ""
    experience: str = ""
    skills: str = ""
    projects: str = ""


# -------------------- HELPERS --------------------

def serialize_document(document):
    """Convert MongoDB ObjectId and timestamps to JSON-safe values."""
    result = dict(document)
    result["id"] = str(result.pop("_id", ""))
    return result


def extract_resume_keywords(resume_text: str) -> list[str]:
    """Extract useful technical keywords from resume text."""
    common_skills = [
        "python", "java", "javascript", "typescript", "react",
        "fastapi", "django", "flask", "node.js", "sql",
        "mongodb", "mysql", "postgresql", "dynamodb", "redis",
        "aws", "azure", "docker", "kubernetes", "git",
        "html", "css", "rest api", "restful api", "machine learning",
        "pandas", "numpy", "pytorch", "tensorflow", "kafka",
        "clickhouse", "microservices", "linux", "c++", "c",
        "communication", "problem solving", "data structures",
        "algorithms", "pytest", "unit testing",
    ]

    text = resume_text.lower()
    return [skill for skill in common_skills if skill in text]


def validate_job_url(url: str):
    """Allow public HTTP/HTTPS URLs only."""
    parsed = urlparse(url)

    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise HTTPException(
            status_code=400,
            detail="Please provide a valid HTTP or HTTPS job URL.",
        )

    host = parsed.hostname.lower()

    if (
        host == "localhost"
        or host.endswith(".localhost")
        or host.endswith(".local")
        or host in {"127.0.0.1", "0.0.0.0", "::1"}
        or host.startswith("10.")
        or host.startswith("192.168.")
        or re.match(r"^172\.(1[6-9]|2[0-9]|3[0-1])\.", host)
    ):
        raise HTTPException(
            status_code=400,
            detail="Private or local URLs cannot be imported.",
        )


def extract_job_from_url(url: str) -> dict:
    validate_job_url(url)

    try:
        response = requests.get(
            url,
            timeout=15,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 Chrome/120 Safari/537.36"
                )
            },
        )
        response.raise_for_status()
    except requests.RequestException:
        raise HTTPException(
            status_code=400,
            detail=(
                "Could not access that job page. "
                "The site may block automated requests."
            ),
        )

    soup = BeautifulSoup(response.text, "html.parser")

    for tag in soup(["script", "style", "noscript", "nav", "footer"]):
        tag.decompose()

    title_tag = soup.find("meta", property="og:title")
    page_title = (
        title_tag.get("content", "").strip()
        if title_tag
        else ""
    )

    if not page_title and soup.title:
        page_title = soup.title.get_text(" ", strip=True)

    description_tag = soup.find("meta", attrs={"name": "description"})
    description = (
        description_tag.get("content", "").strip()
        if description_tag
        else ""
    )

    if not description:
        main_content = soup.find("main") or soup.body or soup
        description = main_content.get_text(" ", strip=True)[:8000]

    return {
        "title": page_title or "Imported Job",
        "company": "",
        "location": "",
        "description": description[:8000],
        "skills": extract_resume_keywords(description),
        "url": url,
    }


# -------------------- HEALTH --------------------

@app.get("/")
def root():
    return {"message": "OneApply API is running"}


@app.get("/health")
def health():
    try:
        client.admin.command("ping")
        return {"status": "ok", "database": "connected"}
    except PyMongoError:
        raise HTTPException(
            status_code=503,
            detail="API is running, but MongoDB is unavailable.",
        )


# -------------------- JOBS --------------------

@app.get("/jobs")
def get_jobs():
    try:
        rows = jobs_collection.find().sort("_id", -1)
        return [serialize_document(row) for row in rows]
    except PyMongoError:
        raise HTTPException(
            status_code=503,
            detail="Could not load jobs from MongoDB.",
        )


@app.post("/jobs")
def create_job(job: JobCreate):
    try:
        document = job.model_dump()
        document["created_at"] = datetime.now(timezone.utc)

        result = jobs_collection.insert_one(document)
        saved = jobs_collection.find_one({"_id": result.inserted_id})

        return serialize_document(saved)
    except PyMongoError:
        raise HTTPException(
            status_code=503,
            detail="Could not save the job to MongoDB.",
        )


@app.post("/match")
def match_jobs(request: MatchRequest):
    resume_skills = set(
        skill.lower()
        for skill in (
            request.skills + extract_resume_keywords(request.resume_text)
        )
    )

    try:
        matches = []

        for job in jobs_collection.find():
            job_skills = set(
                skill.lower()
                for skill in job.get("skills", [])
            )

            if not job_skills and job.get("description"):
                job_skills.update(
                    extract_resume_keywords(job["description"])
                )

            common = sorted(resume_skills.intersection(job_skills))
            score = (
                round(len(common) / len(job_skills) * 100)
                if job_skills
                else 0
            )

            item = serialize_document(job)
            item["match_score"] = score
            item["matched_skills"] = common
            matches.append(item)

        matches.sort(key=lambda item: item["match_score"], reverse=True)
        return {"matches": matches}
    except PyMongoError:
        raise HTTPException(
            status_code=503,
            detail="Could not match jobs from MongoDB.",
        )


@app.post("/job-import")
def import_job(payload: dict):
    url = str(payload.get("url", "")).strip()

    if not url:
        raise HTTPException(
            status_code=400,
            detail="A job URL is required.",
        )

    extracted = extract_job_from_url(url)

    # Keep user-supplied details if provided.
    for field in ["title", "company", "location", "description", "skills"]:
        if payload.get(field):
            extracted[field] = payload[field]

    try:
        extracted["created_at"] = datetime.now(timezone.utc)
        result = jobs_collection.insert_one(extracted)
        saved = jobs_collection.find_one({"_id": result.inserted_id})

        return serialize_document(saved)
    except PyMongoError:
        raise HTTPException(
            status_code=503,
            detail="Could not save the imported job.",
        )


# -------------------- RESUME BUILDER --------------------

@app.post("/resume")
def save_resume(resume: ResumeSaveRequest):
    """Save editable resume details to MongoDB."""
    document = resume.model_dump()
    document["updated_at"] = datetime.now(timezone.utc)

    try:
        # One current resume record per app installation/user session.
        # For a multi-user app, add authentication and a user ID instead.
        resumes_collection.update_one(
            {"profile_key": "default"},
            {"$set": document, "$setOnInsert": {"profile_key": "default"}},
            upsert=True,
        )

        saved = resumes_collection.find_one({"profile_key": "default"})
        return {
            "message": "Resume details saved to MongoDB.",
            "resume": serialize_document(saved),
        }
    except PyMongoError:
        raise HTTPException(
            status_code=503,
            detail="Could not save resume details.",
        )


@app.get("/resume")
def get_resume():
    try:
        saved = resumes_collection.find_one({"profile_key": "default"})

        if not saved:
            return {"resume": None}

        return {"resume": serialize_document(saved)}
    except PyMongoError:
        raise HTTPException(
            status_code=503,
            detail="Could not load resume details.",
        )


# -------------------- PDF UPLOAD --------------------

@app.post("/resume/upload")
async def upload_resume(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Please upload a PDF file.",
        )

    if file.content_type not in {
        "application/pdf",
        "application/octet-stream",
        None,
    }:
        raise HTTPException(
            status_code=400,
            detail="The uploaded file must be a PDF.",
        )

    content = await file.read()

    if not content:
        raise HTTPException(status_code=400, detail="The PDF is empty.")

    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail="PDF must be smaller than 10 MB.",
        )

    try:
        reader = PdfReader(BytesIO(content))

        if reader.is_encrypted:
            raise HTTPException(
                status_code=400,
                detail="Please upload an unlocked PDF.",
            )

        text_parts = []
        for page in reader.pages:
            text_parts.append(page.extract_text() or "")

        resume_text = "\n".join(text_parts).strip()

        if not resume_text:
            raise HTTPException(
                status_code=400,
                detail=(
                    "No selectable text was found in this PDF. "
                    "It may be a scanned image; OCR is not enabled."
                ),
            )

        document = {
            "profile_key": "default",
            "filename": file.filename,
            "resume_text": resume_text,
            "keywords": extract_resume_keywords(resume_text),
            "updated_at": datetime.now(timezone.utc),
        }

        resumes_collection.update_one(
            {"profile_key": "default"},
            {"$set": document},
            upsert=True,
        )

        return {
            "message": "PDF uploaded and text extracted successfully.",
            "filename": file.filename,
            "resume_text": resume_text,
            "keywords": document["keywords"],
        }

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Could not read this PDF. Please check that it is valid.",
        )


# -------------------- COVER LETTER --------------------

@app.post("/cover-letter")
def generate_cover_letter(request: ResumeRequest):
    job_title = request.job_title.strip()
    company = request.company.strip() or "your organization"
    job_description = request.job_description.strip()
    resume_text = request.resume_text.strip()

    if not job_title:
        raise HTTPException(
            status_code=400,
            detail="Job title is required.",
        )

    if not resume_text:
        # Fall back to the latest resume stored in MongoDB.
        try:
            saved = resumes_collection.find_one({"profile_key": "default"})
            if saved:
                resume_text = saved.get("resume_text", "") or "\n".join(
                    str(saved.get(field, ""))
                    for field in [
                        "name", "summary", "education",
                        "experience", "skills", "projects",
                    ]
                )
        except PyMongoError:
            raise HTTPException(
                status_code=503,
                detail="Could not retrieve your saved resume.",
            )

    if not resume_text:
        raise HTTPException(
            status_code=400,
            detail="Please fill in your resume details or upload a text-based PDF first.",
        )

    resume_skills = extract_resume_keywords(resume_text)
    job_skills = extract_resume_keywords(job_description)
    relevant_skills = sorted(set(resume_skills).intersection(job_skills))

    skills_sentence = (
        ", ".join(relevant_skills[:8])
        if relevant_skills
        else ", ".join(resume_skills[:6])
    )

    if skills_sentence:
        skills_paragraph = (
            f"My background includes experience or knowledge in "
            f"{skills_sentence}. I would welcome the opportunity to "
            f"apply these skills to the responsibilities of this role."
        )
    else:
        skills_paragraph = (
            "My background and project experience have helped me develop "
            "technical and problem-solving skills relevant to this opportunity."
        )

    cover_letter = f"""Dear Hiring Manager,

I am writing to express my interest in the {job_title} position at {company}. I am enthusiastic about the opportunity to contribute to your team and continue developing my professional skills.

{skills_paragraph}

I am keen to learn, collaborate with colleagues, and contribute to meaningful projects. I would appreciate the opportunity to discuss how my background aligns with your team's needs.

Thank you for considering my application. I look forward to hearing from you.

Sincerely,
{_resume_name(resume_text)}"""

    return {"cover_letter": cover_letter}


def _resume_name(resume_text: str) -> str:
    # Prefer a saved name when available; otherwise use a neutral sign-off.
    try:
        saved = resumes_collection.find_one({"profile_key": "default"})
        if saved and saved.get("name"):
            return saved["name"]
    except PyMongoError:
        pass

    return "Applicant"
