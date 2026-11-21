
import subprocess
import sys
import uuid
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
EVIDENCE_DIR = Path(__file__).resolve().parent / "evidence"


def run_unattended_detection(video_path):
    video_path = Path(video_path).resolve()

    if not video_path.exists():
        raise FileNotFoundError("Video file not found")

    run_id = str(uuid.uuid4())
    run_evidence_dir = EVIDENCE_DIR / run_id
    run_evidence_dir.mkdir(parents=True, exist_ok=True)
    alert_log_path = run_evidence_dir / "alerts.jsonl"

    command = [
        sys.executable,
        str(PROJECT_ROOT / "unattended_object.py"),
        "--video", str(video_path),
        "--model", str(PROJECT_ROOT / "yolov8s.pt"),
        "--save-frames", str(run_evidence_dir),
        "--save-interval", "1",
    ]

    process = subprocess.Popen(
        command,
        cwd=PROJECT_ROOT
    )

    return {
        "message": "Unattended object detection started",
        "process_id": process.pid,
        "run_id": run_id,
        "evidence_directory": str(run_evidence_dir),
        "alert_log_path": str(alert_log_path),
        "process": process
    }
