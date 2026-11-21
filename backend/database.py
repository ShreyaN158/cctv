import sqlite3
from pathlib import Path

DATABASE_PATH = Path(__file__).parent / "cctv_database.db"


def get_connection():
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database():
    connection = get_connection()

    connection.execute("""
        CREATE TABLE IF NOT EXISTS incidents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            camera_id TEXT NOT NULL,
            incident_type TEXT NOT NULL,
            description TEXT,
            confidence REAL,
            evidence_path TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'Pending'
        )
    """)

    connection.commit()
    connection.close()