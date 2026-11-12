# Driving and movement research

- Camera-relative third-person controls are most readable when movement is built from the camera's flattened forward/right basis, diagonal input is clamped to unit length, and the character rotates to face the resulting movement vector. Source: [Programming Camera-Relative Movement Controls](https://manningbooks.medium.com/programming-camera-relative-movement-controls-34ca76056ad0).
- A game car should communicate weight through acceleration and braking, while steering rate is tied to speed so the vehicle does not rotate in place. Source: [Programming Vehicles in Games](https://wassimulator.com/blog/programming-vehicles-in-games).
- Arcade handling still benefits from separating longitudinal motion, braking, lateral grip, and steering. Tire grip can be tuned as a gameplay model rather than requiring a full tire simulator. Source: [Arcade car physics](https://gamedev.net/forums/topic/699625-arcade-car-physics/).

Applied to City Roam: correct the car's model/physics forward-axis mismatch, keep joystick forward aligned with the character/car nose, use acceleration and opposing-input braking, cap reverse separately, and make steering speed-dependent with grip-like heading correction.
