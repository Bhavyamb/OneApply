
import { useEffect, useState } from "react";
import "./index.css";

const API_URL = "http://127.0.0.1:8000";

function App() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [skills, setSkills] = useState("Python, FastAPI, SQL");
  const [matchedJobs, setMatchedJobs] = useState([]);
  const [matching, setMatching] = useState(false);

  const [form, setForm] = useState({
    title: "",
    company: "",
    location: "Bengaluru",
    url: "",
    notes: "",
  });

  async function loadJobs() {
    try {
      setError("");
      const response = await fetch(`${API_URL}/jobs`);
      if (!response.ok) throw new Error(`Request failed: ${response.status}`);

      const data = await response.json();
      setJobs(data);
    } catch (err) {
      setError(err.message || "Unable to load jobs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadJobs();
  }, []);

  async function addJob(event) {
    event.preventDefault();
    setMessage("");

    try {
      const response = await fetch(`${API_URL}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        const details = await response.text();
        throw new Error(details || `Request failed: ${response.status}`);
      }

      setForm({
        title: "",
        company: "",
        location: "Bengaluru",
        url: "",
        notes: "",
      });

      setMessage("Job added successfully.");
      await loadJobs();
    } catch (err) {
      setMessage(`Could not add job: ${err.message}`);
    }
  }

  async function findMatches() {
    setMatching(true);
    setMessage("");

    try {
      const response = await fetch(`${API_URL}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skills: skills.split(",").map((skill) => skill.trim()).filter(Boolean),
        }),
      });

      if (!response.ok) throw new Error(`Request failed: ${response.status}`);

      const data = await response.json();
      setMatchedJobs(Array.isArray(data) ? data : data.jobs || []);
      setMessage("Job matching completed.");
    } catch (err) {
      setMessage(`Could not match jobs: ${err.message}`);
    } finally {
      setMatching(false);
    }
  }

  const statCards = [
    { label: "Available jobs", value: jobs.length },
    { label: "Locations", value: new Set(jobs.map((job) => job.location).filter(Boolean)).size },
    { label: "With application links", value: jobs.filter((job) => job.url).length },
  ];

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
          <a href="#profile">Skills</a>
          <a href="#add-job">Add job</a>
        </nav>

        <a className="primary-btn" href="#jobs">Explore jobs</a>
      </header>

      <main className="dashboard" id="dashboard">
        <section className="hero">
          <p className="eyebrow">Your career, organized</p>
          <h1>Your next chapter starts here.</h1>
          <p className="subtitle">
            Keep track of opportunities, discover relevant roles, and organize
            your job search in one place.
          </p>

          <div className="hero-actions">
            <a className="primary-btn" href="#jobs">View opportunities</a>
            <a className="secondary-btn" href="#add-job">Add a job</a>
          </div>
        </section>

        <section className="stats-grid" aria-label="Job statistics">
          {statCards.map((stat) => (
            <article className="stat-card" key={stat.label}>
              <p>{stat.label}</p>
              <strong>{loading ? "—" : stat.value}</strong>
            </article>
          ))}
        </section>

        <div className="content-grid">
          <section className="panel" id="jobs">
            <div className="panel-header">
              <h2>Recent opportunities</h2>
              <span>{jobs.length} total</span>
            </div>

            {loading && <p className="empty-state">Loading jobs...</p>}

            {error && (
              <div className="empty-state">
                <p>{error}</p>
                <button className="secondary-btn" onClick={loadJobs}>
                  Try again
                </button>
              </div>
            )}

            {!loading && !error && jobs.length === 0 && (
              <p className="empty-state">No jobs yet. Add your first opportunity.</p>
            )}

            <ul className="job-list">
              {jobs.map((job) => (
                <li key={job.id}>
                  <div>
                    <h3>{job.title}</h3>
                    <p>{job.company} · {job.location || "Location not specified"}</p>
                    {job.notes && <p>{job.notes}</p>}
                  </div>

                  {job.url ? (
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="secondary-btn"
                    >
                      Open ↗
                    </a>
                  ) : (
                    <span className="job-link-unavailable">No link</span>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="panel" id="add-job">
            <div className="panel-header">
              <h2>Add opportunity</h2>
              <span>Save to your list</span>
            </div>

            <form className="job-form" onSubmit={addJob}>
              <label>
                Job title
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Python Developer"
                />
              </label>

              <label>
                Company
                <input
                  required
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  placeholder="Company name"
                />
              </label>

              <label>
                Location
                <input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="Bengaluru / Remote"
                />
              </label>

              <label>
                Job URL
                <input
                  type="url"
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder="https://..."
                />
              </label>

              <label>
                Notes
                <textarea
                  rows="3"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Requirements or reminders"
                />
              </label>

              <button className="primary-btn submit-btn" type="submit">
                Save opportunity
              </button>
            </form>
          </section>

          <section className="panel" id="profile">
            <div className="panel-header">
              <h2>Skills & job matching</h2>
              <span>Find relevant roles</span>
            </div>

            <div className="profile-box">
              <label>
                Your skills (comma-separated)
                <textarea
                  rows="3"
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                  placeholder="Python, SQL, FastAPI"
                />
              </label>

              <button
                className="primary-btn profile-btn"
                onClick={findMatches}
                disabled={matching}
              >
                {matching ? "Matching..." : "Find matching jobs"}
              </button>

              {matchedJobs.length > 0 && (
                <ul className="job-list">
                  {matchedJobs.map((job) => (
                    <li key={job.id}>
                      <div>
                        <h3>{job.title}</h3>
                        <p>{job.company}</p>
                      </div>
                      {job.match_score !== undefined && (
                        <strong>{job.match_score}%</strong>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>Stay organized</h2>
              <span>Quick overview</span>
            </div>
            <p className="empty-state">
              Save job links and notes, review your opportunities, and keep your
              skills ready for your next application.
            </p>
            <a className="secondary-btn" href="#add-job">Add an opportunity</a>
          </section>
        </div>

        {message && <p className="status-message" role="status">{message}</p>}

        <footer className="status-message">
          OneApply · Your job search, organized.
        </footer>
      </main>
    </div>
  );
}

export default App;
