
import { useEffect, useState } from "react";

const API_URL = "https://oneapply.onrender.com";

const emptyResume = {
  name: "",
  email: "",
  phone: "",
  location: "",
  summary: "",
  education: "",
  experience: "",
  skills: "",
  projects: "",
};

const resumeSections = [
  ["Professional Summary", "summary"],
  ["Experience", "experience"],
  ["Projects", "projects"],
  ["Skills", "skills"],
  ["Education", "education"],
];

function Field({
  label,
  name,
  placeholder,
  multiline = false,
  value,
  onChange,
}) {
  const inputClass =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

  return (
    <div>
      <label
        className="mb-1 block text-sm font-medium text-gray-700"
        htmlFor={name}
      >
        {label}
      </label>

      {multiline ? (
        <textarea
          id={name}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          rows={4}
          className={inputClass}
        />
      ) : (
        <input
          id={name}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={inputClass}
        />
      )}
    </div>
  );
}

function App() {
  const [page, setPage] = useState("dashboard");
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [resume, setResume] = useState(() => {
    try {
      return {
        ...emptyResume,
        ...JSON.parse(localStorage.getItem("oneapply_resume") || "{}"),
      };
    } catch {
      return { ...emptyResume };
    }
  });

  const [resumeTemplate, setResumeTemplate] = useState(() => {
    return localStorage.getItem("oneapply_resume_template") || "classic";
  });

  const [pdf, setPdf] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [savingResume, setSavingResume] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [loadingResume, setLoadingResume] = useState(true);

  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [coverLetter, setCoverLetter] = useState("");
  const [coverLoading, setCoverLoading] = useState(false);
  const [coverError, setCoverError] = useState("");

  const inputClass =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

  const buttonClass =
    "rounded-lg bg-indigo-600 px-4 py-2.5 font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60";

  // Load dashboard jobs.
  useEffect(() => {
    async function fetchJobs() {
      try {
        const response = await fetch(`${API_URL}/jobs`);

        if (!response.ok) {
          throw new Error(`Could not load jobs (${response.status})`);
        }

        const data = await response.json();

        setJobs(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err.message || "Could not load jobs.");
      } finally {
        setLoading(false);
      }
    }

    fetchJobs();
  }, []);

  // Load saved resume details from MongoDB.
  // Browser data remains available if the server cannot be reached.
  useEffect(() => {
    let cancelled = false;

    async function fetchResume() {
      try {
        const response = await fetch(`${API_URL}/resume`);

        if (!response.ok) {
          throw new Error("Could not load the saved resume.");
        }

        const data = await response.json();

        if (!cancelled && data.resume) {
          const serverResume = {
            ...emptyResume,
            ...data.resume,
          };

          setResume((current) => ({
            ...current,
            ...serverResume,
          }));

          localStorage.setItem(
            "oneapply_resume",
            JSON.stringify(serverResume)
          );
        }
      } catch {
        // Keep the locally saved resume if the server is unavailable.
      } finally {
        if (!cancelled) {
          setLoadingResume(false);
        }
      }
    }

    fetchResume();

    return () => {
      cancelled = true;
    };
  }, []);

  function updateResume(event) {
    const { name, value } = event.target;

    setResume((current) => ({
      ...current,
      [name]: value,
    }));

    setSaveMessage("");
  }

  async function saveResume(event) {
    event.preventDefault();
    setSavingResume(true);
    setSaveMessage("");

    // Save locally first so the details remain available in this browser.
    localStorage.setItem("oneapply_resume", JSON.stringify(resume));
    localStorage.setItem("oneapply_resume_template", resumeTemplate);

    try {
      const response = await fetch(`${API_URL}/resume`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(resume),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.detail || "Could not save resume to the server."
        );
      }

      setSaveMessage(
        "Resume saved successfully to MongoDB and this browser."
      );
    } catch (err) {
      setSaveMessage(
        `Saved in this browser, but server saving failed: ${err.message}`
      );
    } finally {
      setSavingResume(false);
    }
  }

  async function uploadResume(event) {
    event.preventDefault();

    if (!pdf) {
      setUploadMessage("Please choose a PDF file first.");
      return;
    }

    if (!pdf.name.toLowerCase().endsWith(".pdf")) {
      setUploadMessage("Please choose a file ending in .pdf.");
      return;
    }

    const formData = new FormData();
    formData.append("file", pdf);

    setUploading(true);
    setUploadMessage("");

    try {
      const response = await fetch(`${API_URL}/resume/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.detail || `Upload failed (${response.status}).`
        );
      }

      if (data.resume_text) {
        setResume((current) => ({
          ...current,
          summary: current.summary || data.resume_text,
        }));
      }

      setUploadMessage(data.message || "PDF uploaded successfully.");
    } catch (err) {
      setUploadMessage(
        `Upload failed: ${err.message}. Check that the deployed backend has the /resume/upload endpoint.`
      );
    } finally {
      setUploading(false);
    }
  }

  async function generateCoverLetter(event) {
    event.preventDefault();
    setCoverLoading(true);
    setCoverError("");
    setCoverLetter("");

    try {
      const resumeText = Object.values(resume)
        .filter((value) => typeof value === "string" && value.trim())
        .join("\n");

      const response = await fetch(`${API_URL}/cover-letter`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resume_text: resumeText,
          job_title: jobTitle,
          company,
          job_description: jobDescription,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.detail || "Could not generate the cover letter."
        );
      }

      const result =
        data.cover_letter || data.letter || data.content || data.text;

      if (!result) {
        throw new Error("The server returned no cover letter.");
      }

      setCoverLetter(result);
    } catch (err) {
      setCoverError(err.message);
    } finally {
      setCoverLoading(false);
    }
  }

  async function copyCoverLetter() {
    try {
      await navigator.clipboard.writeText(coverLetter);
      alert("Cover letter copied.");
    } catch {
      alert("Copy failed. Please select the text and copy it manually.");
    }
  }

  function printResume() {
    document.body.classList.add("printing-resume");

    const cleanup = () => {
      document.body.classList.remove("printing-resume");
      window.removeEventListener("afterprint", cleanup);
    };

    window.addEventListener("afterprint", cleanup);
    window.print();
  }

  const templateHeaderClass =
    resumeTemplate === "modern"
      ? "border-indigo-600"
      : resumeTemplate === "minimal"
        ? "border-gray-300"
        : "border-gray-900";

  return (
    <main className="min-h-screen bg-gray-100 text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5">
          <div>
            <h1 className="text-2xl font-extrabold text-indigo-700">
              OneApply
            </h1>
            <p className="text-sm text-gray-500">
              Your job search, resume and applications in one place.
            </p>
          </div>

          <nav className="flex flex-wrap gap-2">
            {[
              ["dashboard", "Dashboard"],
              ["resume", "Resume Builder"],
              ["cover", "Cover Letter"],
            ].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setPage(id)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                  page === id
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-indigo-50"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8">
        {page === "dashboard" && (
          <section>
            <h2 className="text-2xl font-bold">Your job dashboard</h2>
            <p className="mb-7 mt-1 text-gray-600">
              Keep track of the opportunities you are interested in.
            </p>

            <div className="mb-6 rounded-xl border bg-white p-5 shadow-sm">
              <p className="text-sm text-gray-500">Saved jobs</p>
              <p className="mt-1 text-3xl font-bold">{jobs.length}</p>
            </div>

            {loading && <p>Loading jobs...</p>}

            {error && (
              <p className="rounded-lg bg-red-100 p-4 text-red-700">
                Failed to load jobs: {error}
              </p>
            )}

            {!loading && !error && jobs.length === 0 && (
              <div className="rounded-xl bg-white p-8 text-center">
                No jobs found yet.
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              {jobs.map((job, index) => (
                <article
                  key={job.id || job._id || index}
                  className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
                >
                  <h3 className="text-xl font-semibold">{job.title}</h3>

                  <p className="mt-2 text-gray-700">
                    {job.company}
                    {job.location ? ` Â· ${job.location}` : ""}
                  </p>

                  {job.description && (
                    <p className="mt-3 whitespace-pre-line text-sm text-gray-600">
                      {job.description}
                    </p>
                  )}

                  {job.skills?.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {job.skills.map((skill, skillIndex) => (
                        <span
                          key={`${skill}-${skillIndex}`}
                          className="rounded-full bg-indigo-50 px-3 py-1 text-sm text-indigo-800"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => {
                      setJobTitle(job.title || "");
                      setCompany(job.company || "");
                      setJobDescription(job.description || "");
                      setCoverLetter("");
                      setPage("cover");
                    }}
                    className="mt-5 text-sm font-semibold text-indigo-700 hover:underline"
                  >
                    Create cover letter â†’
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}

        {page === "resume" && (
          <section className="grid items-start gap-6 lg:grid-cols-2">
            <div className="rounded-xl border bg-white p-6 shadow-sm">
              <h2 className="text-2xl font-bold">Resume Builder</h2>
              <p className="mb-6 mt-2 text-sm text-gray-500">
                Edit your details, choose a template, and save or export your
                resume.
              </p>

              {loadingResume && (
                <p className="mb-4 text-sm text-gray-500">
                  Checking for a saved resume...
                </p>
              )}

              <form onSubmit={saveResume} className="space-y-4">
                <Field
                  label="Full name"
                  name="name"
                  placeholder="Your name"
                  value={resume.name}
                  onChange={updateResume}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Email"
                    name="email"
                    placeholder="you@example.com"
                    value={resume.email}
                    onChange={updateResume}
                  />

                  <Field
                    label="Phone"
                    name="phone"
                    placeholder="Your phone number"
                    value={resume.phone}
                    onChange={updateResume}
                  />
                </div>

                <Field
                  label="Location"
                  name="location"
                  placeholder="City, country"
                  value={resume.location}
                  onChange={updateResume}
                />

                <Field
                  label="Professional summary"
                  name="summary"
                  placeholder="A short introduction about your experience and goals"
                  multiline
                  value={resume.summary}
                  onChange={updateResume}
                />

                <Field
                  label="Experience"
                  name="experience"
                  placeholder="Role, company, dates and key achievements"
                  multiline
                  value={resume.experience}
                  onChange={updateResume}
                />

                <Field
                  label="Projects"
                  name="projects"
                  placeholder="Project names, technologies and outcomes"
                  multiline
                  value={resume.projects}
                  onChange={updateResume}
                />

                <Field
                  label="Skills"
                  name="skills"
                  placeholder="Python, FastAPI, MongoDB, SQL..."
                  multiline
                  value={resume.skills}
                  onChange={updateResume}
                />

                <Field
                  label="Education"
                  name="education"
                  placeholder="Degree, college, graduation year"
                  multiline
                  value={resume.education}
                  onChange={updateResume}
                />

                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={savingResume}
                    className={buttonClass}
                  >
                    {savingResume ? "Saving..." : "Save resume details"}
                  </button>

                  <button
                    type="button"
                    onClick={printResume}
                    className="rounded-lg border border-gray-300 px-4 py-2.5 font-semibold hover:bg-gray-50"
                  >
                    Print / Save as PDF
                  </button>
                </div>

                {saveMessage && (
                  <p
                    className="break-words text-sm"
                    role="status"
                    aria-live="polite"
                  >
                    {saveMessage}
                  </p>
                )}
              </form>
            </div>

            <div className="space-y-6">
              <div className="rounded-xl border bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold">Upload an existing resume</h3>
                <p className="mb-4 mt-1 text-sm text-gray-500">
                  Choose a PDF file and upload it to OneApply.
                </p>

                <form onSubmit={uploadResume} className="space-y-3">
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={(event) => {
                      setPdf(event.target.files?.[0] || null);
                      setUploadMessage("");
                    }}
                    className="block w-full text-sm"
                  />

                  {pdf && (
                    <p className="break-words text-sm text-gray-600">
                      Selected: {pdf.name}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={uploading}
                    className={buttonClass}
                  >
                    {uploading ? "Uploading..." : "Upload PDF"}
                  </button>

                  {uploadMessage && (
                    <p
                      className="break-words text-sm text-gray-700"
                      role="status"
                    >
                      {uploadMessage}
                    </p>
                  )}
                </form>
              </div>

              <div
                className={`resume-preview rounded-xl border bg-white p-6 shadow-sm ${
                  resumeTemplate === "minimal"
                    ? "font-sans text-gray-700"
                    : "font-sans text-gray-900"
                }`}
              >
                <div className="mb-5 print:hidden">
                  <label
                    htmlFor="resumeTemplate"
                    className="mb-2 block text-sm font-semibold text-gray-700"
                  >
                    Choose resume template
                  </label>

                  <select
                    id="resumeTemplate"
                    value={resumeTemplate}
                    onChange={(event) => {
                      const selected = event.target.value;
                      setResumeTemplate(selected);
                      localStorage.setItem(
                        "oneapply_resume_template",
                        selected
                      );
                    }}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5"
                  >
                    <option value="classic">Classic ATS</option>
                    <option value="modern">Modern Professional</option>
                    <option value="minimal">Minimal</option>
                  </select>

                  <p className="mt-2 text-xs text-gray-500">
                    Your selected template is remembered in this browser.
                  </p>
                </div>

                <div
                  className={`border-b-2 pb-4 ${templateHeaderClass}`}
                >
                  <h2
                    className={`break-words font-bold ${
                      resumeTemplate === "modern"
                        ? "text-3xl text-indigo-700"
                        : "text-2xl text-gray-900"
                    }`}
                  >
                    {resume.name || "Your Name"}
                  </h2>

                  <p className="mt-2 break-words text-sm leading-6 text-gray-600">
                    {[resume.email, resume.phone, resume.location]
                      .filter(Boolean)
                      .join(" | ") || "Email | Phone | Location"}
                  </p>
                </div>

                {resumeSections.map(([heading, key]) =>
                  resume[key]?.trim() ? (
                    <section key={key} className="mt-5">
                      <h3
                        className={`mb-2 border-b pb-1 text-sm font-bold uppercase tracking-wide ${
                          resumeTemplate === "modern"
                            ? "border-indigo-200 text-indigo-700"
                            : resumeTemplate === "minimal"
                              ? "border-gray-200 text-gray-700"
                              : "border-gray-400 text-gray-900"
                        }`}
                      >
                        {heading}
                      </h3>

                      <p className="whitespace-pre-line break-words text-sm leading-6">
                        {resume[key]}
                      </p>
                    </section>
                  ) : null
                )}

                {!resumeSections.some(([, key]) => resume[key]?.trim()) && (
                  <p className="mt-5 text-sm text-gray-400">
                    Your summary, experience, projects, skills, and education
                    will appear here as you fill them in.
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        {page === "cover" && (
          <section className="mx-auto max-w-3xl rounded-xl border bg-white p-6 shadow-sm md:p-8">
            <h2 className="text-2xl font-bold">Cover Letter Generator</h2>
            <p className="mb-6 mt-2 text-sm text-gray-500">
              Add the job details and generate a letter based on your resume.
            </p>

            <form onSubmit={generateCoverLetter} className="space-y-4">
              <div>
                <label
                  className="mb-1 block text-sm font-medium"
                  htmlFor="jobTitle"
                >
                  Job title
                </label>
                <input
                  id="jobTitle"
                  required
                  value={jobTitle}
                  onChange={(event) => setJobTitle(event.target.value)}
                  placeholder="Backend Developer"
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  className="mb-1 block text-sm font-medium"
                  htmlFor="company"
                >
                  Company
                </label>
                <input
                  id="company"
                  required
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                  placeholder="Company name"
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  className="mb-1 block text-sm font-medium"
                  htmlFor="jobDescription"
                >
                  Job description
                </label>
                <textarea
                  id="jobDescription"
                  value={jobDescription}
                  onChange={(event) => setJobDescription(event.target.value)}
                  placeholder="Paste the job description here..."
                  rows={5}
                  className={inputClass}
                />
              </div>

              <button
                disabled={coverLoading}
                className={buttonClass}
              >
                {coverLoading ? "Generating..." : "Generate cover letter"}
              </button>
            </form>

            {coverError && (
              <p className="mt-4 break-words rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {coverError}
              </p>
            )}

            {coverLetter && (
              <div className="mt-6">
                <label
                  className="mb-2 block font-semibold"
                  htmlFor="coverResult"
                >
                  Generated cover letter
                </label>

                <textarea
                  id="coverResult"
                  value={coverLetter}
                  onChange={(event) => setCoverLetter(event.target.value)}
                  rows={14}
                  className={inputClass}
                />

                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={copyCoverLetter}
                    className={buttonClass}
                  >
                    Copy letter
                  </button>

                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="rounded-lg border border-gray-300 px-4 py-2.5 font-semibold hover:bg-gray-50"
                  >
                    Print / Save as PDF
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      <style>{`
        @media print {
          body.printing-resume * {
            visibility: hidden !important;
          }

          body.printing-resume .resume-preview,
          body.printing-resume .resume-preview * {
            visibility: visible !important;
          }

          body.printing-resume .resume-preview {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            margin: 0;
            padding: 0;
            border: none;
            box-shadow: none;
          }

          body.printing-resume .resume-preview section {
            break-inside: avoid;
          }
        }

        @page {
          size: A4;
          margin: 14mm;
        }
      `}</style>
    </main>
  );
}

export default App;


