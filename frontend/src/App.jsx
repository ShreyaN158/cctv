
import { useEffect, useState } from 'react'
import './App.css'

const API = 'http://127.0.0.1:8000'

function App() {
  const [incidents, setIncidents] = useState([])
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [running, setRunning] = useState(false)
  const [detectionRun, setDetectionRun] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const detectionRunId = detectionRun?.run_id
  const detectionRunStatus = detectionRun?.status

  const fetchIncidents = async () => {
    try {
      const response = await fetch(`${API}/incidents`)
      if (!response.ok) throw new Error('Unable to load incidents')
      const data = await response.json()
      setIncidents(data)
      setError('')
    } catch (err) {
      setError('Cannot connect to backend. Check whether FastAPI is running.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchIncidents()
    const interval = setInterval(fetchIncidents, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!detectionRunId || detectionRunStatus !== 'running') return

    let active = true
    const fetchRunStatus = async () => {
      try {
        const response = await fetch(`${API}/runs/${detectionRunId}`)
        const data = await response.json()
        if (!response.ok) throw new Error(data.detail || 'Unable to load detection')
        if (active) setDetectionRun(data)
      } catch (err) {
        if (active) setError(err.message)
      }
    }

    fetchRunStatus()
    const interval = setInterval(fetchRunStatus, 1000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [detectionRunId, detectionRunStatus])

  const uploadVideo = async () => {
    if (!selectedFile) {
      setError('Please select a video first.')
      return
    }

    setUploading(true)
    setError('')
    setMessage('')

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      const response = await fetch(`${API}/upload-video`, {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || 'Upload failed')

      setMessage(`Video uploaded successfully: ${data.filename}`)
      setSelectedFile(null)
      return data.filename
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setUploading(false)
    }
  }

  const startDetection = async () => {
    setRunning(true)
    setError('')
    setMessage('')

    try {
      let filename = null

      if (selectedFile) {
        filename = await uploadVideo()
        if (!filename) return
      }

      if (!filename) {
        setError('Select a video before starting detection.')
        return
      }

      const response = await fetch(
        `${API}/run-detection/${encodeURIComponent(filename)}`,
        { method: 'POST' }
      )

      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || 'Detection failed')

      setDetectionRun({
        ...data,
        status: 'running',
        frame_count: 0,
        latest_frame: null,
      })
      setMessage(`Detection started successfully. Run ID: ${data.run_id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  const updateStatus = async (id, status) => {
    try {
      const response = await fetch(
        `${API}/incidents/${id}/status?status=${encodeURIComponent(status)}`,
        { method: 'PATCH' }
      )

      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || 'Status update failed')

      setMessage('Incident status updated.')
      fetchIncidents()
    } catch (err) {
      setError(err.message)
    }
  }

  const pending = incidents.filter(item => item.status === 'Pending').length
  const reviewed = incidents.filter(item => item.status === 'Reviewed').length
  const resolved = incidents.filter(item => item.status === 'Resolved').length

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">◈</div>
          <div>
            <h2>BorderVision</h2>
            <span>INTELLIGENT SURVEILLANCE</span>
          </div>
        </div>

        <div className="nav-label">WORKSPACE</div>
        <a className="nav-item active" href="#overview">▦ Dashboard</a>
        <a className="nav-item" href="#detection">◎ AI Detection</a>
        <a className="nav-item" href="#incidents">▤ Incidents</a>

        <div className="sidebar-bottom">
          <div className="system-status">
            <span className="status-dot"></span>
            <div>
              <strong>System Online</strong>
              <small>Monitoring service</small>
            </div>
          </div>
          <p>Smart CCTV Monitoring System</p>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="breadcrumb">WORKSPACE / DASHBOARD</p>
            <h1>Security Overview</h1>
          </div>
          <div className="topbar-right">
            <span className="live-indicator">
              <span className="status-dot"></span> LIVE SYSTEM
            </span>
            <div className="profile">BV</div>
          </div>
        </header>

        <section id="overview">
          <div className="welcome">
            <div>
              <span className="eyebrow">INTELLIGENT VIDEO ANALYTICS</span>
              <h2>Surveillance Command Center</h2>
              <p>Monitor security incidents and analyze CCTV footage from one place.</p>
            </div>
            <div className="welcome-symbol">◈</div>
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <span>Total Incidents</span>
              <strong>{incidents.length}</strong>
              <small>Recorded in database</small>
            </div>
            <div className="stat-card warning">
              <span>Pending Review</span>
              <strong>{pending}</strong>
              <small>Require attention</small>
            </div>
            <div className="stat-card info">
              <span>Reviewed</span>
              <strong>{reviewed}</strong>
              <small>Under review completed</small>
            </div>
            <div className="stat-card success">
              <span>Resolved</span>
              <strong>{resolved}</strong>
              <small>Closed incidents</small>
            </div>
          </div>
        </section>

        <section id="detection" className="panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">AI VIDEO ANALYSIS</span>
              <h2>Run Detection</h2>
            </div>
            <span className="model-tag">YOLOv8s</span>
          </div>

          <p className="section-description">
            Upload recorded CCTV footage to start unattended-object detection.
          </p>

          <div className="upload-area">
            <div className="upload-icon">⇧</div>
            <div className="upload-text">
              <strong>Select CCTV video</strong>
              <span>Supported formats: MP4, AVI, MOV, MKV</span>
            </div>
            <input
              type="file"
              accept=".mp4,.avi,.mov,.mkv,video/*"
              onChange={e => setSelectedFile(e.target.files[0] || null)}
            />
          </div>

          {selectedFile && (
            <p className="file-selected">Selected: {selectedFile.name}</p>
          )}

          <button
            className="primary-button"
            onClick={startDetection}
            disabled={uploading || running || detectionRun?.status === 'running'}
          >
            {uploading || running || detectionRun?.status === 'running'
              ? 'Detection running...'
              : '▶  Upload & Start Detection'}
          </button>
        </section>

        {detectionRun && (
          <section className="panel detection-preview">
            <div className="section-heading">
              <div>
                <span className="eyebrow">PERSON AND OBJECT TRACKING</span>
                <h2>Detection Preview</h2>
              </div>
              <span className={`run-status ${detectionRun.status}`}>
                {detectionRun.status}
              </span>
            </div>
            <p className="section-description">
              Annotated frames update as the uploaded video is analyzed.
              {` ${detectionRun.frame_count || 0} preview frames available.`}
            </p>
            {detectionRun.latest_frame ? (
              <img
                className="detection-frame"
                src={`${API}/runs/${detectionRun.run_id}/frames/${detectionRun.latest_frame}`}
                alt="Latest annotated detection frame"
              />
            ) : (
              <p className="empty-state">Waiting for the first detection frame...</p>
            )}
            {detectionRun.status === 'failed' && (
              <p className="error-message">
                Detection stopped with exit code {detectionRun.exit_code}.
              </p>
            )}
          </section>
        )}

        {message && <div className="message success-message">{message}</div>}
        {error && <div className="message error-message">{error}</div>}

        <section id="incidents" className="panel incidents-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">SECURITY EVENTS</span>
              <h2>Recent Incidents</h2>
            </div>
            <button className="refresh-button" onClick={fetchIncidents}>
              ↻ Refresh
            </button>
          </div>

          {loading ? (
            <p className="empty-state">Loading incidents...</p>
          ) : incidents.length === 0 ? (
            <p className="empty-state">No incidents recorded yet.</p>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>CAMERA</th>
                    <th>INCIDENT</th>
                    <th>DESCRIPTION</th>
                    <th>TIMESTAMP</th>
                    <th>STATUS</th>
                    <th>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {incidents.map(incident => (
                    <tr key={incident.id}>
                      <td>#{incident.id}</td>
                      <td>{incident.camera_id}</td>
                      <td>{incident.incident_type}</td>
                      <td>{incident.description || '—'}</td>
                      <td>{incident.timestamp}</td>
                      <td>
                        <span className={`status-badge ${incident.status.toLowerCase()}`}>
                          {incident.status}
                        </span>
                      </td>
                      <td>
                        <select
                          value={incident.status}
                          onChange={e => updateStatus(incident.id, e.target.value)}
                        >
                          <option value="Pending">Pending</option>
                          <option value="Reviewed">Reviewed</option>
                          <option value="Resolved">Resolved</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <footer>
          BorderVision AI · Smart CCTV Monitoring System
          <span>Powered by FastAPI, React & YOLO</span>
        </footer>
      </main>
    </div>
  )
}

export default App
