import math
from typing import List, Tuple, Dict
import numpy as np

# In a real environment, we'd use mediapipe.solutions.face_mesh
# import mediapipe as mp
# mp_face_mesh = mp.solutions.face_mesh
# The below class provides the logic structure required to process those landmarks.

class OcularForensics:
    def __init__(self):
        # Calibration baseline values
        self.baseline_ear = None
        self.baseline_gaze = None
        
        # History
        self.ear_history: List[float] = []
        self.gaze_history: List[float] = []
        
    def _calculate_ear(self, eye_landmarks: List[Tuple[float, float]]) -> float:
        """
        Calculates Eye Aspect Ratio to detect blinks and volatility.
        eye_landmarks: expects 6 points defining the eye contour
        """
        def dist(p1, p2):
            return math.dist(p1, p2)
            
        # Vertical distances
        v1 = dist(eye_landmarks[1], eye_landmarks[5])
        v2 = dist(eye_landmarks[2], eye_landmarks[4])
        # Horizontal distance
        h = dist(eye_landmarks[0], eye_landmarks[3])
        
        return (v1 + v2) / (2.0 * h) if h != 0 else 0
        
    def _calculate_gaze_deviation(self, iris_center: Tuple[float, float], head_pose_vector: Tuple[float, float]) -> float:
        """
        Computes angular deviation between head pose and iris vector to detect scanning.
        Returns deviation in degrees.
        """
        # Simplified vector math for the hackathon MVP
        dot_product = (iris_center[0] * head_pose_vector[0]) + (iris_center[1] * head_pose_vector[1])
        mag_i = math.sqrt(iris_center[0]**2 + iris_center[1]**2)
        mag_h = math.sqrt(head_pose_vector[0]**2 + head_pose_vector[1]**2)
        
        if mag_i * mag_h == 0:
            return 0.0
            
        cos_theta = max(-1.0, min(1.0, dot_product / (mag_i * mag_h)))
        return math.degrees(math.acos(cos_theta))

    def process_frame(self, face_landmarks: List[Tuple[float, float]], iris_landmarks: List[Tuple[float, float]], is_calibration: bool) -> Dict[str, float]:
        """
        Main entry point for a single frame.
        """
        # Mock indices for eye contour
        left_eye_pts = [face_landmarks[i] for i in [33, 160, 158, 133, 153, 144]] 
        ear = self._calculate_ear(left_eye_pts)
        
        # Mock finding center of iris vs head center
        iris_center = iris_landmarks[0] # simplification
        head_vector = (1.0, 0.0) # Assume looking straight ahead initially
        
        gaze_dev = self._calculate_gaze_deviation(iris_center, head_vector)
        
        if is_calibration:
            self.ear_history.append(ear)
            self.gaze_history.append(gaze_dev)
            if len(self.ear_history) > 30: # mock 30 frames
                self.baseline_ear = np.mean(self.ear_history)
                self.baseline_gaze = np.mean(self.gaze_history)
            return {"status": "calibrating"}
            
        # Inquiry Phase Analysis
        is_blink = ear < (self.baseline_ear * 0.8) if self.baseline_ear else False
        is_scanning = gaze_dev > 30.0 # Configured threshold from the logic document
        
        # Volatility: Current EAR vs Baseline (simplified standard deviation substitute)
        blink_volatility = abs(ear - (self.baseline_ear or ear))
        
        return {
            "saccadic_sweep_rate": gaze_dev,
            "blink_rate_volatility": blink_volatility,
            "is_scanning": is_scanning,
            "is_blink": is_blink
        }
