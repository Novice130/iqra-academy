import subprocess
import time
import os
import signal

ARTIFACT_DIR = "/Users/abdulhannan/.gemini/antigravity/brain/c4ed65cf-0a74-4a27-b7ef-e217a33a0210"
VIDEO_PATH = os.path.join(ARTIFACT_DIR, "novice_tutor_ios_demo.mp4")

def run(cmd):
    subprocess.run(cmd, shell=True, check=False)

def main():
    print("🎬 Initializing iOS Simulator Video Recording on booted device...")
    
    # Clean up previous video if exists
    if os.path.exists(VIDEO_PATH):
        os.remove(VIDEO_PATH)

    # 1. Start on Home Screen showing the Novice Tutor App Icon
    run("xcrun simctl launch booted com.apple.springboard")
    time.sleep(2)

    # 2. Start Video Recording Process
    print("🎥 Starting xcrun simctl screen recording...")
    proc = subprocess.Popen(
        ["xcrun", "simctl", "io", "booted", "recordVideo", "--codec=h264", VIDEO_PATH],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    time.sleep(3)

    try:
        # Scene 1: Launch Novice Tutor App (Show Splash & Login Screen)
        print("▶ Scene 1: App Launch & Login Screen...")
        run("xcrun simctl launch booted com.novicetutor.app")
        time.sleep(5)

        # Scene 2: Open Student Dashboard
        print("▶ Scene 2: Student Dashboard & Upcoming Classes...")
        run('xcrun simctl openurl booted "https://novicetutor.com/dashboard"')
        time.sleep(5)

        # Scene 3: Booking & Availability Grid
        print("▶ Scene 3: Booking & Teacher Availability Sync...")
        run('xcrun simctl openurl booted "https://novicetutor.com/dashboard/booking"')
        time.sleep(5)

        # Scene 4: Live Quran LMS Classroom with Zoom-Style Invite Modal
        print("▶ Scene 4: Live Classroom & 12-Digit Invite Link...")
        run('xcrun simctl openurl booted "https://novicetutor.com/join/482-910-374-819"')
        time.sleep(6)

        # Scene 5: Teacher 24h Availability Hub
        print("▶ Scene 5: Teacher 24h Availability Hub...")
        run('xcrun simctl openurl booted "https://novicetutor.com/dashboard/teacher/availability"')
        time.sleep(5)

        # Scene 6: Return to Home Screen & App Switcher
        print("▶ Scene 6: App Switcher & Home Screen...")
        run("xcrun simctl launch booted com.apple.springboard")
        time.sleep(3)

    finally:
        print("⏹ Stopping video recording...")
        proc.send_signal(signal.SIGINT)
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
        time.sleep(3)

    if os.path.exists(VIDEO_PATH) and os.path.getsize(VIDEO_PATH) > 1000:
        print(f"✅ Video recorded successfully! Size: {os.path.getsize(VIDEO_PATH)} bytes")
        print(f"📁 Saved to: {VIDEO_PATH}")
    else:
        print("❌ Recording failed or file is empty.")

if __name__ == "__main__":
    main()
