from pydantic import BaseModel
from typing import Optional


class IncidentCreate(BaseModel):
    camera_id: str
    incident_type: str
    description: Optional[str] = None
    confidence: Optional[float] = None
    evidence_path: Optional[str] = None


class IncidentResponse(BaseModel):
    id: int
    camera_id: str
    incident_type: str
    description: Optional[str]
    confidence: Optional[float]
    evidence_path: Optional[str]
    timestamp: str
    status: str
    