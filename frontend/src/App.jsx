import { useEffect, useState } from 'react'
import './App.css'

const initialForm = {
  title: '',
  company: '',
  location: 'Remote',
  url: '',
  notes: '',
}

const defaultSkills = 'React, Python, FastAPI, SQL, JavaScript'

function App() {
  const [jobs, setJobs] = useState([])
  const [matches, setMatches] = useState([])
  const [skillsInput, setSkillsInput] = useState(defaultSkills)
  const [form, setForm] = useState(initialForm)
  const [jobUrlInput, setJobUrlInput] = useState('')
  const [resumeText, setResumeText] = useState('')
  const [selectedJobId, setSelectedJobId] = useState('')
  const [generatedLetter, setGeneratedLetter] = useState('')
  const [message, setMessage] = useState('')

  const fetchJobs = async () => {
    try {
      const response = await fetch('http://127.0.0.1:8000/jobs')
      const data = await response.json()
      setJobs(data)
      if (data.length && !selectedJobId) {
        setSelectedJobId(String(data[0].id))
      }
      return data
    } catch (error) {
      setMessage('Backend is not running. Start the FastAPI server first.')
      return []
    }
  }

  const fetchMatches = async (skills = skillsInput) => {
    const parsedSkills = skills
      .split(',')
      .map((skill) => skill.trim())
      .filter(Boolean)

    if (!parsedSkills.length) {
      setMatches([])
      return
    }

    try {
      const response = await fetch('http://127.0.0.1:8000/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skills: parsedSkills }),
      })

      if (!response.ok) {
        throw new Error('Unable to calculate matches')
      }

      const data = await response.json()
      setMatches(data)
      const topMatch = data[0]
      setMessage(topMatch ? `Top match: ${topMatch.title} (${topMatch.match_score}%)` : 'No strong matches yet.')
    } catch (error) {
      setMessage('Could not calculate matches. Check the backend server.')
    }
  }

  useEffect(() => {
    const loadData = async () => {
      const savedJobs = await fetchJobs()
      if (savedJobs.length) {
        await fetchMatches(defaultSkills)
      }
    }
    loadData()
  }, [])

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    try {
      const response = await fetch('http://127.0.0.1:8000/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (!response.ok) {
        throw new Error('Unable to save job')
      }

      const savedJob = await response.json()
      setJobs((current) => [savedJob, ...current])
      setSelectedJobId(String(savedJob.id))
      setForm(initialForm)
      setMessage(`Saved: ${savedJob.title} at ${savedJob.company}`)
      await fetchMatches()
    } catch (error) {
      setMessage('Could not save the job. Check the backend server.')
    }
  }

  const handleImportJobFromUrl = async () => {
    const url = jobUrlInput.trim()
    if (!url) {
      setMessage('Paste a LinkedIn, Indeed, or Naukri job URL first.')
      return
    }

    try {
      const response = await fetch('http://127.0.0.1:8000/job-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })

      if (!response.ok) {
        throw new Error('Could not import the job')
      }

      const importedJob = await response.json()
      const payload = {
        title: importedJob.title,
        company: importedJob.company,
        location: importedJob.location || 'Remote',
        url: importedJob.url,
        notes: importedJob.notes || `Imported from ${url}`,
      }

      const saveResponse = await fetch('http://127.0.0.1:8000/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!saveResponse.ok) {
        throw new Error('Could not save imported job')
      }

      const savedJob = await saveResponse.json()
      setJobs((current) => [savedJob, ...current])
      setSelectedJobId(String(savedJob.id))
      setForm((current) => ({ ...current, ...payload }))
      setJobUrlInput('')
      setMessage(`Imported: ${savedJob.title} at ${savedJob.company}`)
      await fetchMatches()
    } catch (error) {
      setMessage('Could not import this job URL. Try pasting the job page link directly.')
    }
  }

  const handleResumeUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const text = await file.text()
    setResumeText(text)
    setMessage(`Loaded resume: ${file.name}`)
  }

  const handleGenerateLetter = async () => {
    const selectedJob = jobs.find((job) => String(job.id) === selectedJobId) || jobs[0]

    if (!selectedJob || !resumeText.trim()) {
      setMessage('Add a saved job and paste your resume text before generating a cover letter.')
      return
    }

    try {
      const response = await fetch('http://127.0.0.1:8000/cover-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume_text: resumeText,
          job_title: selectedJob.title,
          company: selectedJob.company,
          candidate_name: 'Your Name',
        }),
      })

      if (!response.ok) {
        throw new Error('Unable to generate cover letter')
      }

      const data = await response.json()
      setGeneratedLetter(data.cover_letter)
      setMessage(`Draft ready for ${selectedJob.company}`)
    } catch (error) {
      setMessage('Cover letter generation failed. Check the backend server.')
    }
  }

  const matchMap = Object.fromEntries(matches.map((job) => [job.id, job.match_score]))
  const topScore = matches[0]?.match_score ?? 0

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">O</span>
          <span>OneApply</span>
        </div>
        <nav className="nav">
          <a href="#dashboard">Dashboard</a>
          <a href="#jobs">Jobs</a>
          <a href="#add-job">Add job</a>
        </nav>
        <button className="primary-btn">Add job</button>
      </header>

      <main className="dashboard" id="dashboard">
        <section className="hero">
          <div>
            <p className="eyebrow">Career dashboard</p>
            <h1>Apply smarter, not harder.</h1>
            <p className="subtitle">
              Keep every opportunity in one place and track your strongest job matches.
            </p>
            <div className="hero-actions">
              <button className="primary-btn">View matches</button>
              <button className="secondary-btn">Upload resume</button>
            </div>
          </div>
        </section>

        <section className="stats-grid">
          <article className="stat-card">
            <p>Jobs tracked</p>
            <strong>{jobs.length}</strong>
          </article>
          <article className="stat-card">
            <p>Skill matches</p>
            <strong>{topScore}%</strong>
          </article>
          <article className="stat-card">
            <p>Interviews</p>
            <strong>3</strong>
          </article>
        </section>

        <section className="content-grid" id="jobs">
          <div className="panel">
            <div className="panel-header">
              <h2>Saved jobs</h2>
              <span>{jobs.length} total</span>
            </div>
            <ul className="job-list">
              {jobs.length === 0 ? (
                <li className="empty-state">No jobs saved yet. Add your first role.</li>
              ) : (
                jobs.map((job) => (
                  <li key={job.id}>
                    <div>
                      <h3>{job.title}</h3>
                      <p>
                        {job.company} · {job.location}
                      </p>
                    </div>
                    <strong>{matchMap[job.id] ? `${matchMap[job.id]}% match` : 'Saved'}</strong>
                  </li>
                ))
              )}
            </ul>
          </div>

          <aside className="panel side-panel" id="add-job">
            <div className="panel-header">
              <h2>Add a job</h2>
            </div>

            <form className="job-form" onSubmit={handleSubmit}>
              <label>
                Job title
                <input name="title" value={form.title} onChange={handleChange} required />
              </label>

              <label>
                Company
                <input name="company" value={form.company} onChange={handleChange} required />
              </label>

              <label>
                Location
                <input name="location" value={form.location} onChange={handleChange} />
              </label>

              <label>
                Job link
                <input name="url" value={form.url} onChange={handleChange} placeholder="https://..." />
              </label>

              <label>
                Notes
                <textarea name="notes" value={form.notes} onChange={handleChange} rows="4" />
              </label>

              <button className="primary-btn submit-btn" type="submit">
                Save job
              </button>
            </form>

            <div className="divider" />

            <div className="profile-box">
              <h3>Import from LinkedIn / Indeed / Naukri</h3>
              <input
                value={jobUrlInput}
                onChange={(event) => setJobUrlInput(event.target.value)}
                placeholder="https://www.linkedin.com/jobs/..."
              />
              <button className="secondary-btn profile-btn" type="button" onClick={handleImportJobFromUrl}>
                Import job
              </button>
            </div>

            <div className="divider" />

            <div className="profile-box">
              <h3>Your profile skills</h3>
              <textarea
                value={skillsInput}
                onChange={(event) => setSkillsInput(event.target.value)}
                rows="3"
                placeholder="React, Python, SQL, FastAPI"
              />
              <button
                className="secondary-btn profile-btn"
                type="button"
                onClick={() => fetchMatches()}
              >
                Match jobs
              </button>
            </div>

            <div className="divider" />

            <div className="resume-box">
              <h3>Resume + cover letter</h3>

              <label className="file-label">
                Upload resume (.txt or .md)
                <input type="file" accept=".txt,.md" onChange={handleResumeUpload} />
              </label>

              <textarea
                value={resumeText}
                onChange={(event) => setResumeText(event.target.value)}
                rows="8"
                placeholder="Paste or upload your resume text here..."
              />

              {jobs.length > 0 && (
                <select value={selectedJobId} onChange={(event) => setSelectedJobId(event.target.value)}>
                  {jobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.title} at {job.company}
                    </option>
                  ))}
                </select>
              )}

              <button className="primary-btn profile-btn" type="button" onClick={handleGenerateLetter}>
                Generate cover letter
              </button>
            </div>

            {generatedLetter && (
              <div className="letter-box">
                <h4>Draft cover letter</h4>
                <pre>{generatedLetter}</pre>
              </div>
            )}

            {message && <p className="status-message">{message}</p>}
          </aside>
        </section>
      </main>
    </div>
  )
}

export default App
