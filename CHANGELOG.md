# Changelog

## 0.2.5

- Recognize Streamlit dashboards, README-documented Python commands, uncommon Python entry filenames, and additional dependency manifests.
- Add support for Deno, Make, Just, Taskfile, Procfile, Swift, Elixir, R/Shiny, and more Maven applications.
- Validate the actual Python interpreter before trusting a virtual environment, repair incomplete environments, and avoid activating an environment that is already active.
- Support Flask application factories instead of assuming every module exports `app`.
- Show stable localhost URLs for recognized web servers and provide **Open URL** and **Copy URL** actions.
- Detect common build packages such as Tailwind when source files reference them but they are not installed or declared.
- Detect occupied ports for Node entry files, select a nearby free port when the project supports `PORT`, and warn instead of silently killing an existing process.
- Improve dependency checks and present multiple verified run choices when a project has more than one runnable workflow.

## 0.2.0 - Initial public release

- Detect common project types, locate the correct folder, check dependencies, and fill the complete command without executing it.
