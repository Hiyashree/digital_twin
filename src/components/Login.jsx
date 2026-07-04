import { useState } from "react";
import BrandLogo from "./BrandLogo.jsx";
import { apiUrl } from "../config/api.js";
import "./Login.css";

export default function Login({ onSuccess, onTokenReceived }) {
  const [mode, setMode] = useState("login");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const form = e.target;

    if (mode === "login") {
      const username = form.user.value.trim();
      const password = form.pass.value;
      if (!username || !password) {
        setStatus("Please enter username and password.");
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(apiUrl("/auth/login"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setStatus(data?.message || "Login failed. Please try again.");
          return;
        }

        if (data?.token) {
          onTokenReceived(data.token);
        }
        onSuccess();
        setStatus("");
      } catch (error) {
        setStatus("Auth server is offline. Start backend with `npm run dev:full`.");
      } finally {
        setLoading(false);
      }
      return;
    }

    const username = form.user.value.trim();
    const email = form.email.value.trim();
    const password = form.pass.value;
    const confirm = form.confirm.value;

    if (!username || !email || !password || !confirm) {
      setStatus("Please complete all signup fields.");
      return;
    }
    if (password !== confirm) {
      setStatus("Passwords do not match. Please check and try again.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(apiUrl("/auth/signup"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(data?.message || "Signup failed. Please try again.");
        return;
      }

      setStatus("Account created successfully. Please login with your new credentials.");
      setMode("login");
      form.reset();
    } catch (error) {
      setStatus("Auth server is offline. Start backend with `npm run dev:full`.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="glow-ring" />
        <div className="auth-inner">
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 22 }}>
            <BrandLogo size={56} alt="" aria-hidden />
          </div>
          <h2 className="auth-heading">
            {mode === "login" ? "Welcome Back" : "Create Your Account"}
          </h2>
          <p className="auth-subtitle">
            {mode === "login"
              ? "Sign in to continue to the digital twin dashboard."
              : "Join now and start exploring the sign up flow."}
          </p>

          <form className="auth-form" onSubmit={handleSubmit}>
            <input className="auth-input" type="text" name="user" placeholder="Username" />
            {mode === "signup" && (
              <input className="auth-input" type="email" name="email" placeholder="Email address" />
            )}
            <input className="auth-input" type="password" name="pass" placeholder="Password" />
            {mode === "signup" && (
              <input className="auth-input" type="password" name="confirm" placeholder="Confirm password" />
            )}
            <button className="auth-button" type="submit" disabled={loading}>
              {loading ? "Please wait..." : mode === "login" ? "Login" : "Sign Up"}
            </button>
          </form>

          <div className="auth-toggle">
            {mode === "login" ? (
              <>
                <span>New here?</span>
                <button type="button" onClick={() => { setMode("signup"); setStatus(""); }}>
                  Create account
                </button>
              </>
            ) : (
              <>
                <span>Already registered?</span>
                <button type="button" onClick={() => { setMode("login"); setStatus(""); }}>
                  Sign in
                </button>
              </>
            )}
          </div>

          {status && <div className="auth-status">{status}</div>}
          
        </div>
      </div>
    </div>
  );
}
