# CuraPath Medical Parser

CuraPath is a medical document parsing and extraction system built with Python, FastAPI, and Mistral AI, accompanied by a modern React frontend.

## Project Structure

- **Backend (`/src`)**: A Python-based agent and extractor system.
  - `src/agent/`: Contains the FastAPI application and core agent logic.
  - `src/extractor/`: Handles document/image extraction, leveraging `mistralai` and structured outputs via `pydantic`.
- **Frontend (`/web`)**: A React + Vite frontend application styled with Tailwind CSS and Radix UI components.

## Tech Stack

- **Backend**: Python 3.11+, FastAPI, Uvicorn, Mistral AI, PyMongo, Pydantic, Hatchling (build system), uv (package manager).
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, React Router, Lucide React.

## Getting Started

The project includes a `Makefile` to simplify setup and running of various components.

### Prerequisites
- Python >= 3.11
- [uv](https://github.com/astral-sh/uv) package manager
- Node.js & npm (for the frontend)

### Installation

To install all backend dependencies (including dev extras):

```bash
make install
```

To install frontend dependencies:

```bash
make web-install
```

### Running the Backend

Start the FastAPI agent server on port 8000:

```bash
make run-api
```

You can also run a CLI demo planning pass on a fixture:

```bash
make plan-demo
```

### Running the Frontend

Run the Vite development server in mock mode:

```bash
make web
```

### Doctor Dashboard Credentials

To test the application as a doctor, log in using the following credentials:
- **Email:** `doctor`
- **Password:** `doctor123`

Or run it connecting to the real API:

```bash
make web-real
```

### Linting & Formatting

Format and fix linting issues using Ruff:

```bash
make lint
```

Run tests using pytest:

```bash
make test
```
