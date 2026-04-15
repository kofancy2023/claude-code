# Kimi-like AI Chat Application - Design System

## Project Info
- **Stitch Project ID:** 12010932360260127381
- **Design System:** Nocturne Slate
- **Reference:** https://www.kimi.com/

## Design Screens

### Screen 1: Chat Landing Page (`screen1_chat_landing`)
- The main landing page with centered chat input
- Deep navy sidebar with navigation and history
- Feature pill buttons below the input

### Screen 2: Active Chat Conversation (`screen2_active_chat`)
- Active AI chat with message bubbles
- User messages in light purple, AI messages in white
- Code blocks with dark background and syntax highlighting
- Chat input bar at bottom

### Screen 3: Feature Showcase (`screen3_feature_showcase`)
- Feature discovery screen with card grid
- 6 feature cards: Smart Search, Document Analysis, PPT Generation, Spreadsheet, Deep Research, Agent Cluster
- Search bar at top with recent searches at bottom

## Design Tokens

### Colors
| Token | Hex | Usage |
|-------|-----|-------|
| Sidebar Background | #1a1a2e | Left sidebar, code blocks |
| Main Background | #f9f9fa | Main content area |
| Workspace | #f3f3f4 | Chat environment |
| White | #ffffff | AI messages, cards, input |
| Primary | #5341cd | Links, accents |
| Primary Container | #6c5ce7 | Active states, send button |
| Secondary Container | #e2e0fc | User message bubbles |
| Text Primary | #1a1c1d | Main text |
| Text Secondary | #474554 | Descriptions, metadata |
| Outline | #787586 | Borders (use at 15% opacity) |
| Outline Variant | #c8c4d7 | Ghost borders |

### Typography
- **Font:** Inter (all weights)
- **Headlines:** Bold, -0.02em letter-spacing
- **Body (AI output):** 1rem, line-height 1.6
- **Labels:** Uppercase, +0.05em letter-spacing

### Spacing & Layout
- Sidebar width: 260px
- Content max-width: 768px (chat), 900px (feature grid)
- Message spacing: 24px vertical gap
- Border radius: 12px (containers), 24px (input), 9999px (pills)

### Component Styles
- **No borders** - Use tonal layering for separation
- **User messages:** #e2e0fc background, right-aligned
- **AI messages:** #ffffff background, left-aligned with avatar
- **Code blocks:** #1a1a2e background
- **Primary buttons:** Gradient (#5341cd -> #6c5ce7)
- **Sidebar active:** Purple accent pill on left edge

## File Structure
```
my_design/
├── .stitch/
│   ├── DESIGN.md          # This file
│   └── designs/
│       ├── screen1_chat_landing.html
│       ├── screen1_chat_landing.png
│       ├── screen2_active_chat.html
│       ├── screen2_active_chat.png
│       ├── screen3_feature_showcase.html
│       └── screen3_feature_showcase.png
```
