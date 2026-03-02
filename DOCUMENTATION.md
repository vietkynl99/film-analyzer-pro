# Film Analyzer System - Project Documentation

## 1. Project Goal
The Film Analyzer System is a professional-grade platform designed for film producers, script analysts, and studio executives. It centralizes film project management and leverages Gemini AI to provide deep insights into scripts, marketability, and creative elements, streamlining the greenlighting and production tracking process.

## 2. Core Features
- **Film Repository**: A structured database to store and manage film projects.
- **AI Analysis Engine**: Integration with Gemini AI to analyze synopses or scripts for:
    - Genre & Tone identification.
    - Character arc evaluation.
    - Pacing and structure analysis.
    - Marketability and target audience prediction.
- **Visual Asset Management**: Handling of film posters and concept art.
- **Production Tracker**: A workflow-based status management system.
- **Executive Dashboard**: High-level overview of the project pipeline and analysis trends.

## 3. User Roles
- **Administrator**: System configuration, user management, and full data access.
- **Analyst**: Primary user responsible for inputting film data and triggering AI analyses.
- **Executive/Viewer**: Read-only access to dashboards and finalized analysis reports.

## 4. Data Model
### Entity: Film
| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Unique identifier |
| `title` | String | Working title of the film |
| `director` | String | Attached or target director |
| `synopsis` | Text | Brief summary of the plot |
| `status` | Enum | Current stage in the production workflow |
| `genre` | String | Primary and secondary genres |
| `posterUrl` | String | URL to the film's poster or concept art |
| `budget` | Number | Estimated or actual budget |
| `analysis` | JSON | AI-generated insights (Tone, Pacing, Characters, etc.) |
| `createdAt` | DateTime | Timestamp of creation |
| `updatedAt` | DateTime | Timestamp of last update |

## 5. Production Workflow (Status Flow)
1. **Idea/Draft**: Initial concept phase.
2. **In Analysis**: AI engine is processing the metadata/script.
3. **Analyzed**: Report is ready for review.
4. **Development**: Script polishing and financing.
5. **Pre-Production**: Casting and location scouting.
6. **Production**: Principal photography.
7. **Post-Production**: Editing and VFX.
8. **Released**: Film is completed and distributed.

## 6. Dashboard Structure
- **Pipeline Overview**: Visual funnel showing films at each stage of the workflow.
- **Analysis Metrics**: Average sentiment or "Marketability Score" across the portfolio.
- **Recent Activity**: List of recently added or analyzed projects.
- **Quick Actions**: Buttons for "New Project" or "Run Batch Analysis".

## 7. Film Management Structure
- **Grid/List View**: Scannable list with status badges and thumbnails.
- **Detail View**: 
    - **General Tab**: Basic metadata (Director, Cast, Budget).
    - **Analysis Tab**: Deep dive into AI-generated reports with visualizations.
    - **Assets Tab**: Poster gallery and document links.
- **Edit Mode**: Form-based interface for updating film details.

## 8. Poster Handling Logic
- **Manual Upload**: Users can provide a direct URL to an existing poster.
- **AI Generation**: Integration with Gemini Image models to generate concept posters based on the synopsis.
- **Placeholder System**: Consistent branding for projects without visuals.

## 9. UI/UX Principles
- **Aesthetic**: Technical Dashboard (Recipe 1). High precision, visible grid lines, monospace data points, and professional color palette (Slate/Zinc).
- **Interactivity**: Smooth transitions using `motion`, clear feedback for AI processing states.
- **Accessibility**: High contrast ratios and clear typography for data-heavy views.

## 10. System Architecture (High-Level)
- **Frontend**: React (TypeScript) + Tailwind CSS.
- **State Management**: React Context/Hooks for local state; persistent storage via `better-sqlite3` on the backend.
- **AI Integration**: `@google/genai` for text analysis and image generation.
- **Backend**: Express.js server to handle data persistence and proxy AI requests.
