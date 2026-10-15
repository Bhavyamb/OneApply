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
