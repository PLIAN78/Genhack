"""
ML Module for Security Copilot

Provides machine learning-based behavioral threat detection
using multimodal analysis of ocular, kinetic, and cardiac features.
"""

from .ocular_forensics import OcularForensicsExtractor, OcularFeatures
from .kinetic_forensics import KineticForensicsExtractor, KineticFeatures
from .cardiac_forensics import CardiacForensicsExtractor, CardiacFeatures
from .threat_classifier import (
    ThreatClassifier,
    LLMThreatReasoner,
    MultimodalThreatEngine,
    ThreatAssessment,
)

__all__ = [
    'OcularForensicsExtractor',
    'OcularFeatures',
    'KineticForensicsExtractor',
    'KineticFeatures',
    'CardiacForensicsExtractor',
    'CardiacFeatures',
    'ThreatClassifier',
    'LLMThreatReasoner',
    'MultimodalThreatEngine',
    'ThreatAssessment',
]