from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from backend.database import initialize_database, get_connection
from backend.schemas import IncidentCreate
from backend.ai_integration import run_unattended_detection
from fastapi.middleware.cors import CORSMiddleware
import shutil
import uuid
import json
import threading
import re
from pathlib import Path
from fastapi import UploadFile, File

EVIDENCE_DIR = Path(__file__).parent / "evidence"
DETECTION_RUNS = {}
DETECTION_RUNS_LOCK = threading.Lock()


def save_alerts_to_database(alert_log_path, camera_id="CAM-01"):
    alert_log_path = Path(alert_log_path)

    if not alert_log_path.exists():
        return

    with alert_log_path.open("r", encoding="utf-8") as log_file:
        for line in log_file:
            if not line.strip():
                continue

            alert = json.loads(line)

            connection = get_connection()
            connection.execute("""
                INSERT INTO incidents
                (camera_id, incident_type, description, confidence, evidence_path)
                VALUES (?, ?, ?, ?, ?)
            """, (
                camera_id,
                alert.get("incident_type", "Unattended Object"),
                f"Detected {alert.get('object_type', 'object')} "
                f"(ID: {alert.get('object_id')}). "
                f"Stationary for {alert.get('stationary_duration')} seconds.",
                None,
                str(alert_log_path)
            ))

            connection.commit()
            connection.close()
def monitor_detection(process, alert_log_path):
    return_code = process.wait()

    if return_code == 0:
        save_alerts_to_database(alert_log_path)

app = FastAPI(
    title="Smart CCTV Monitoring System",
    description="Backend API for CCTV detection and monitoring",
    version="1.0.0"
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_event():
    initialize_database()


@app.get("/")
def home():
    return {"message": "Smart CCTV Monitoring System API is running"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}


@app.get("/database-status")
def database_status():
    return {
        "database": "connected",
        "message": "Incident database initialized successfully"
    }


@app.post("/incidents")
def create_incident(incident: IncidentCreate):
    connection = get_connection()

    cursor = connection.execute("""
        INSERT INTO incidents
        (camera_id, incident_type, description, confidence, evidence_path)
        VALUES (?, ?, ?, ?, ?)
    """, (
        incident.camera_id,
        incident.incident_type,
        incident.description,
        incident.confidence,
        incident.evidence_path
    ))

    incident_id = cursor.lastrowid
    connection.commit()
    connection.close()

    return {
        "message": "Incident recorded successfully",
        "incident_id": incident_id
    }


@app.get("/incidents")
def get_incidents():
    connection = get_connection()
    rows = connection.execute(
        "SELECT * FROM incidents ORDER BY timestamp DESC"
    ).fetchall()
    connection.close()

    return [dict(row) for row in rows]


@app.patch("/incidents/{incident_id}/status")
def update_incident_status(incident_id: int, status: str):
    allowed_statuses = ["Pending", "Reviewed", "Resolved"]

    if status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail="Invalid status"
        )

    connection = get_connection()

    cursor = connection.execute(
        "UPDATE incidents SET status = ? WHERE id = ?",
        (status, incident_id)
    )

    connection.commit()
    connection.close()

    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Incident not found")

    return {"message": "Incident status updated successfully"}
UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@app.post("/upload-video")
async def upload_video(file: UploadFile = File(...)):

    allowed_extensions = [".mp4", ".avi", ".mov", ".mkv"]

    file_extension = Path(file.filename).suffix.lower()

    if file_extension not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail="Unsupported video format"
        )

    unique_filename = f"{uuid.uuid4()}{file_extension}"
    file_path = UPLOAD_DIR / unique_filename

    with file_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return {
        "message": "Video uploaded successfully",
        "filename": unique_filename,
        "saved_path": str(file_path)
    }


@app.post("/run-detection/{filename}")
def start_detection(filename: str):

    if Path(filename).name != filename:
        raise HTTPException(
            status_code=400,
            detail="Invalid filename"
        )

    video_path = UPLOAD_DIR / filename

    if not video_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Uploaded video not found"
        )

    try:
        result = run_unattended_detection(video_path)

        process = result.pop("process")
        run_id = result["run_id"]
        alert_log_path = result["alert_log_path"]

        with DETECTION_RUNS_LOCK:
            DETECTION_RUNS[run_id] = process

        threading.Thread(
            target=monitor_detection,
            args=(process, alert_log_path),
            daemon=True
        ).start()

        return result

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=str(error)
        )


@app.get("/runs/{run_id}")
def get_detection_run(run_id: str):
    try:
        run_id = str(uuid.UUID(run_id))
    except ValueError as error:
        raise HTTPException(status_code=400, detail="Invalid run ID") from error

    with DETECTION_RUNS_LOCK:
        process = DETECTION_RUNS.get(run_id)
        if process is None:
            raise HTTPException(status_code=404, detail="Detection run not found")

    exit_code = process.poll()
    frames = sorted((EVIDENCE_DIR / run_id).glob("frame_*.jpg"))
    return {
        "run_id": run_id,
        "status": "running" if exit_code is None else (
            "completed" if exit_code == 0 else "failed"
        ),
        "exit_code": exit_code,
        "frame_count": len(frames),
        "latest_frame": frames[-1].name if frames else None,
    }


@app.get("/runs/{run_id}/frames/{frame_name}")
def get_detection_frame(run_id: str, frame_name: str):
    try:
        run_id = str(uuid.UUID(run_id))
    except ValueError as error:
        raise HTTPException(status_code=400, detail="Invalid run ID") from error

    if re.fullmatch(r"frame_\d{6}\.jpg", frame_name) is None:
        raise HTTPException(status_code=400, detail="Invalid frame name")

    frame_path = EVIDENCE_DIR / run_id / frame_name
    if not frame_path.is_file():
        raise HTTPException(status_code=404, detail="Detection frame not found")

    return FileResponse(
        frame_path,
        media_type="image/jpeg",
        headers={"Cache-Control": "no-store"},
    )