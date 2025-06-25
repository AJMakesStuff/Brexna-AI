# gui_controller.py
import tkinter as tk
from tkinter import messagebox
import subprocess
import threading
import time
import os
import signal # For more robust process termination

class FlaskServerGUI:
    def __init__(self, master):
        self.master = master
        master.title("Flask Server Controller")
        master.geometry("400x250") # Set initial window size
        master.resizable(False, False) # Prevent resizing

        self.flask_process = None # To hold the subprocess object
        self.server_status_text = tk.StringVar()
        self.server_status_text.set("Server Status: Stopped")

        # --- GUI Elements ---
        self.status_label = tk.Label(master, textvariable=self.server_status_text, font=("Arial", 12))
        self.status_label.pack(pady=20)

        self.start_button = tk.Button(master, text="Start Flask Server", command=self.start_server, font=("Arial", 12), bg="#4CAF50", fg="white", activebackground="#45a049")
        self.start_button.pack(pady=10, ipadx=10, ipady=5)

        self.stop_button = tk.Button(master, text="Stop Flask Server", command=self.stop_server, font=("Arial", 12), bg="#f44336", fg="white", activebackground="#da190b")
        self.stop_button.pack(pady=10, ipadx=10, ipady=5)
        self.stop_button["state"] = "disabled" # Initially disabled

        self.check_status_button = tk.Button(master, text="Check Status", command=self.check_server_status, font=("Arial", 10))
        self.check_status_button.pack(pady=5)

        # Protocol for when the window is closed
        master.protocol("WM_DELETE_WINDOW", self.on_closing)

        # Start a thread to periodically check server status (optional but good for feedback)
        self.status_check_thread = threading.Thread(target=self._periodic_status_check, daemon=True)
        self.status_check_thread.start()

    def _update_status_label(self, status, color="black"):
        self.server_status_text.set(f"Server Status: {status}")
        self.status_label.config(fg=color)

    def start_server(self):
        if self.flask_process is None or self.flask_process.poll() is not None: # Check if not running
            self._update_status_label("Starting...", "blue")
            self.start_button["state"] = "disabled"
            self.stop_button["state"] = "disabled" # Disable until confirmed running

            # Run Flask server in a new thread/process
            # Using a thread to run the subprocess call to keep GUI responsive
            threading.Thread(target=self._run_flask_process).start()
        else:
            messagebox.showinfo("Server Status", "Flask server is already running.")

    def _run_flask_process(self):
        try:
            # We use 'python app.py' to launch the Flask server
            # cwd=os.path.dirname(os.path.abspath(__file__)) ensures app.py is found
            # stdout=subprocess.PIPE, stderr=subprocess.PIPE captures output
            # creationflags=subprocess.CREATE_NO_WINDOW hides the console window on Windows
            print("\nAttempting to start Flask server (app.py)...") # For debug in the terminal running gui_controller
            
            # Using shell=True for simpler command, but generally shell=False is safer.
            # For this simple case, it's usually fine.
            if os.name == 'nt': # For Windows
                self.flask_process = subprocess.Popen(
                    ["python", "app.py"],
                    cwd=os.path.dirname(os.path.abspath(__file__)),
                    creationflags=subprocess.CREATE_NO_WINDOW # Hides the console window
                )
            else: # For Linux/macOS
                 self.flask_process = subprocess.Popen(
                    ["python3", "app.py"], # Use python3 for clarity
                    cwd=os.path.dirname(os.path.abspath(__file__))
                 )
            
            # Give the server a moment to start up
            time.sleep(3) 
            self.check_server_status()

        except Exception as e:
            self._update_status_label(f"Failed to Start ({e})", "red")
            self.start_button["state"] = "normal"
            print(f"Error starting Flask server: {e}")
            messagebox.showerror("Error", f"Failed to start Flask server: {e}")

    def stop_server(self):
        if self.flask_process and self.flask_process.poll() is None: # Check if running
            self._update_status_label("Stopping...", "orange")
            self.stop_button["state"] = "disabled"
            self.start_button["state"] = "disabled"
            
            try:
                # Terminate the process (SIGTERM)
                print(f"Attempting to stop Flask server (PID: {self.flask_process.pid})...")
                if os.name == 'nt': # Windows
                    subprocess.run(["taskkill", "/F", "/PID", str(self.flask_process.pid)], creationflags=subprocess.CREATE_NO_WINDOW)
                else: # Linux/macOS
                    os.kill(self.flask_process.pid, signal.SIGTERM)
                
                self.flask_process.wait(timeout=5) # Wait for it to terminate, with a timeout
                self._update_status_label("Stopped", "red")
                print("Flask server stopped.")
            except subprocess.TimeoutExpired:
                print("Server did not terminate gracefully, forcing kill...")
                if os.name == 'nt': # Windows
                    subprocess.run(["taskkill", "/F", "/PID", str(self.flask_process.pid)], creationflags=subprocess.CREATE_NO_WINDOW)
                else: # Linux/macOS
                    os.kill(self.flask_process.pid, signal.SIGKILL) # Force kill (SIGKILL)
                self.flask_process.wait()
                self._update_status_label("Stopped (Forced)", "darkred")
            except Exception as e:
                self._update_status_label(f"Error Stopping ({e})", "darkred")
                print(f"Error stopping Flask server: {e}")
                messagebox.showerror("Error", f"Failed to stop Flask server: {e}")
            finally:
                self.flask_process = None
                self.start_button["state"] = "normal"
                self.stop_button["state"] = "disabled"
        else:
            self._update_status_label("Stopped", "red") # Ensure status is correct
            self.flask_process = None # Clear stale process if it crashed
            self.start_button["state"] = "normal"
            self.stop_button["state"] = "disabled"
            messagebox.showinfo("Server Status", "Flask server is not running.")


    def check_server_status(self):
        if self.flask_process is None:
            self._update_status_label("Stopped", "red")
            self.start_button["state"] = "normal"
            self.stop_button["state"] = "disabled"
        elif self.flask_process.poll() is None: # None means process is still running
            self._update_status_label("Running (http://127.0.0.1:5000)", "green")
            self.start_button["state"] = "disabled"
            self.stop_button["state"] = "normal"
        else: # Process has terminated
            exit_code = self.flask_process.poll()
            self._update_status_label(f"Stopped (Exited with code {exit_code})", "red")
            self.flask_process = None # Clear the process object
            self.start_button["state"] = "normal"
            self.stop_button["state"] = "disabled"

    def _periodic_status_check(self):
        while True:
            time.sleep(5) # Check every 5 seconds
            if self.flask_process:
                self.master.after(0, self.check_server_status) # Update GUI safely from thread
            else:
                self.master.after(0, lambda: self._update_status_label("Stopped", "red"))


    def on_closing(self):
        if messagebox.askokcancel("Quit", "Do you want to quit the GUI and stop the Flask server?"):
            self.stop_server() # Attempt to stop the server before quitting
            self.master.destroy() # Close the GUI window

# --- Main part of GUI script ---
if __name__ == "__main__":
    root = tk.Tk()
    gui = FlaskServerGUI(root)
    root.mainloop()