# Security Copilot

Security Copilot is a multimodal AI-powered system designed to analyze behavioral and physiological signals in real time using a standard camera. The system combines computer vision, signal processing, and machine learning techniques to detect indicators associated with deceptive or high-risk behavior.

This project was developed during the **GenAI Genesis Hackathon at the University of Toronto**, targeting the **TD Track**.

## Hackathon Context

This project was built as a hackathon prototype aimed at addressing problems related to **fraud detection**, a topic that has recently received significant attention due to major fraud incidents reported in the financial sector involving TD.

Our goal was to explore how **real-time behavioral analysis using AI** could support fraud prevention workflows such as:

- Identity verification
- Remote onboarding
- Suspicious interaction detection
- Interview or verification assistance

Unfortunately, our team was not able to present the project **in person at the hackathon**, but we continued developing the prototype to demonstrate the concept and technical approach.

## Project Overview

Security Copilot analyzes three categories of signals from a live camera feed:

### 1. Ocular Analysis
Tracks eye movement patterns to detect signs of cognitive load or avoidance behavior.

Examples of extracted signals:
- Gaze deviation
- Blink rate volatility
- Saccadic eye movements
- Peripheral scanning

### 2. Kinetic Analysis
Evaluates body posture and micro-movements that may indicate stress or defensive behavior.

Examples:
- Ventral shielding gestures
- Hand tremor detection
- Posture shifts
- Defensive body language

### 3. Physiological Analysis
Uses remote photoplethysmography (rPPG) techniques to estimate heart rate without physical sensors.

Examples:
- Heart rate estimation
- Pulse signal extraction
- Physiological arousal indicators

All signals are fused into a single **risk score** generated in real time.

## System Architecture

The system consists of two main components.

### Landing Page
A frontend landing page explaining the system and providing access to the dashboard.

### Dashboard
The dashboard processes camera input and performs the multimodal analysis pipeline.

High level flow:

