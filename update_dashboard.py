import re

with open("web/src/pages/DashboardPage.tsx", "r") as f:
    content = f.read()

content = content.replace('import { Button } from "@/components/ui/button";', 'import { Button } from "@/components/ui/button";\nimport { useAuth } from "@/contexts/AuthContext";')

content = content.replace('export default function DashboardPage() {', 'export default function DashboardPage() {\n  const { user, logout } = useAuth();')

content = content.replace('<h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">Arwen</h1>', '<h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">Arwen Dashboard</h1>')

content = content.replace('<p className="text-sm text-neutral-500 dark:text-neutral-400">Your recovery overview</p>', '<p className="text-sm text-neutral-500 dark:text-neutral-400">Welcome, {user?.name}</p>')

# Add a logout button
content = content.replace('<div className="flex gap-3">', '<div className="flex gap-3">\n          <Button variant="outline" onClick={logout}>Log out</Button>')

with open("web/src/pages/DashboardPage.tsx", "w") as f:
    f.write(content)
