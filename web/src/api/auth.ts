import { AuthResponse, User } from "@/types/models";

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

export async function login(email: string, password: string): Promise<AuthResponse> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.detail || "Login failed");
  }

  return response.json();
}

export async function signup(name: string, email: string, password: string): Promise<AuthResponse> {
  const response = await fetch("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.detail || "Signup failed");
  }

  return response.json();
}

export async function getMe(token: string): Promise<User> {
  if (!token) throw new Error("No token provided");

  const response = await fetch("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error("Invalid session");
  }

  return response.json();
}
