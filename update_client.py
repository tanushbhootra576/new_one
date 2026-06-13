import re

with open("web/src/api/client.ts", "r") as f:
    content = f.read()

helpers = """
function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("token");
  return token ? { "Authorization": `Bearer ${token}` } : {};
}

function buildUrl(path: string): string {
  const patientId = localStorage.getItem("active_patient_id");
  if (patientId) {
    const sep = path.includes("?") ? "&" : "?";
    return `${path}${sep}patient_id=${encodeURIComponent(patientId)}`;
  }
  return path;
}
"""

content = content.replace("const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === \"true\";", "const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === \"true\";\n" + helpers)

def replace_fetch(match):
    url = match.group(1)
    opts = match.group(2)
    if opts:
        # opts is like `, { method: "POST" }`
        return f'fetch(buildUrl({url}){opts[:-1]}, headers: {{ ...getAuthHeaders() }} }})'
    else:
        return f'fetch(buildUrl({url}), {{ headers: getAuthHeaders() }})'

# This regex is a bit tricky, I'll just use string replacements for each specific fetch call.
content = content.replace('fetch("/api/upload", {', 'fetch(buildUrl("/api/upload"), {')
content = content.replace('fetch("/api/plan", {', 'fetch(buildUrl("/api/plan"), {')
content = content.replace('fetch("/api/execute", {', 'fetch(buildUrl("/api/execute"), {')
content = content.replace('fetch("/api/patient/card")', 'fetch(buildUrl("/api/patient/card"), { headers: getAuthHeaders() })')
content = content.replace('fetch("/api/patient/medications")', 'fetch(buildUrl("/api/patient/medications"), { headers: getAuthHeaders() })')
content = content.replace('fetch(`/api/patient/medications/${scheduleId}/doses/${doseId}/mark-taken`, { method: "POST" })', 'fetch(buildUrl(`/api/patient/medications/${scheduleId}/doses/${doseId}/mark-taken`), { method: "POST", headers: getAuthHeaders() })')
content = content.replace('fetch(`/api/patient/medications/${scheduleId}/doses/${doseId}/skip`, { method: "POST" })', 'fetch(buildUrl(`/api/patient/medications/${scheduleId}/doses/${doseId}/skip`), { method: "POST", headers: getAuthHeaders() })')
content = content.replace('fetch("/api/patient/timeline")', 'fetch(buildUrl("/api/patient/timeline"), { headers: getAuthHeaders() })')
content = content.replace('fetch("/api/patient/notifications")', 'fetch(buildUrl("/api/patient/notifications"), { headers: getAuthHeaders() })')
content = content.replace('fetch(`/api/patient/notifications/${id}/read`, { method: "POST" })', 'fetch(buildUrl(`/api/patient/notifications/${id}/read`), { method: "POST", headers: getAuthHeaders() })')
content = content.replace('fetch("/api/coach", {', 'fetch(buildUrl("/api/coach"), {')

# Inject getAuthHeaders() into existing { ... } options
content = content.replace('body: formData,\n  })', 'body: formData,\n    headers: getAuthHeaders(),\n  })')
content = content.replace('headers: { "Content-Type": "application/json" }', 'headers: { "Content-Type": "application/json", ...getAuthHeaders() }')

with open("web/src/api/client.ts", "w") as f:
    f.write(content)
