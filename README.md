# Player Dev Hub

Build the first phase of a web application for AI-assisted sports video analysis and player development.

For now, basketball is the first sport, but the underlying architecture must be designed so additional sports such as soccer, football, volleyball, hockey, and others can be added later without rebuilding the application.

IMPORTANT:
Do not attempt to build computer vision, automatic highlight detection, or actual AI video analysis yet.

This first phase is about building the product foundation, database structure, navigation, dashboard, and user experience.

PRODUCT CONCEPT

The product allows athletes, parents, trainers, and coaches to upload game film, identify a player, generate player-specific clips, organize those clips into different film views, evaluate plays, and eventually receive AI-generated player-development feedback.

The long-term system should follow this universal structure:

Sport → Game → Player → Event → Timestamp → Clip → Evaluation → Playlist/Report

Basketball will be Sport Version 1.

The product should feel like a serious player-development platform, not a flashy social-media highlight maker.

Design inspiration:

Hudl-style sports functionality

Modern SaaS dashboard

Premium athlete development platform

Clean, minimal, professional

Dark or neutral sports-performance aesthetic

Excellent usability on desktop, tablet, and mobile

USER TYPES

Create the architecture so we can eventually support:

Athlete

Parent

Coach

Trainer

Admin

For Phase 1, authentication can simply create a standard user account.

We can add permissions and organization/team roles later.

AUTHENTICATION

Create:

Sign up

Login

Logout

Forgot password

User profile

After signup, run a short onboarding flow.

Ask:

First name

Last name

Primary role: Athlete, Parent, Coach, Trainer

Primary sport

Basketball position if basketball is selected

Optional organization/team name

Basketball positions:

Point Guard

Shooting Guard

Small Forward

Power Forward

Center

Combo Guard

Wing

Forward

Big

MAIN NAVIGATION

Create a left sidebar on desktop and responsive mobile navigation.

Navigation:

Dashboard
Games
Players
Film Room
Development
Reels
Settings

Development and Reels can initially contain placeholder states explaining that those features will be activated in later phases.

DASHBOARD

Create a polished dashboard.

At the top:

"Welcome back, [First Name]"

Include an obvious primary CTA:

Analyze New Game

Dashboard sections:

Recent Games

Show cards with:

Opponent

Date

Player

Processing status

Number of clips

View Game button

Player Development Snapshot

Use placeholder/mock data for now.

Example:

Games Analyzed: 4
Clips Reviewed: 82
Positive Decisions: 64%
Paint Touches: 18
Turnovers: 7

Add a disclaimer in the UI that development metrics will become available after game analysis.

Recent Player Clips

Create mock clip cards with:

Player name

Clip category

Game

Timestamp

Evaluation score

Thumbnail placeholder

GAMES PAGE

Create a searchable list of games.

Each game should have:

Game ID

Game title

Sport

Opponent

Date

Player(s)

Video status

Analysis status

Number of clips

Created by

Created date

Statuses:

Upload Pending
Uploaded
Processing
Ready for Review
Reviewed
Error

Create:

Add Game

For now, clicking Add Game should open a modal/form asking:

Sport
Game title
Opponent
Game date
Player
Home/Away
Notes

Do not implement actual video uploading yet. That comes next.

PLAYERS PAGE

Users should be able to create and manage player profiles.

Player profile fields:

First name
Last name
Profile image
Primary sport
Team
Jersey number
Position
Height
Graduation year
Dominant hand
Notes

For basketball, dominant hand options:

Right
Left
Both

Player profile page should contain tabs:

Overview
Games
Clips
Development

Use realistic mock information for demonstrating the interface.

GAME DETAIL PAGE

Create an important central page for each game.

Header:

Game title
Opponent
Date
Player
Game status

Main layout:

Large video-player placeholder on the left/top.

Clip/Event timeline on the right or below.

Tabs:

All Clips
Offense
Defense
Development
Notes

Create mock events.

Example:

02:14 — Drive — Made Layup
04:51 — Assist — Kickout Pass
07:33 — Turnover — Live Ball
11:22 — Rebound — Defensive
14:08 — Shot — Missed 3PT
18:45 — Defensive Play — Good Rotation

When the user selects an event, display its mock clip information.

CLIP DATA STRUCTURE

Architect the database so every clip/event can eventually contain:

id
game_id
player_id
sport_id
start_time
end_time
event_type
event_subtype
possession_type
outcome
decision_score
outcome_score
impact_score
overall_score
confidence_score
offense_or_defense
tags
notes
approved
manually_edited
created_at

Do not make these basketball-only fields if they can be universal.

Event-specific basketball details should eventually be stored in a flexible metadata field or sport-specific event schema.

SPORT ARCHITECTURE

Create a Sports table.

At minimum:

Basketball

Structure the application so different sports can have different event taxonomies.

Basketball event examples include:

Shot
Drive
Assist
Potential Assist
Rebound
Turnover
Steal
Block
Deflection
Paint Touch
Screen
Closeout
Help Rotation
Transition
Loose Ball

Do not hard-code the entire application around those events.

FILM ROOM PAGE

Create a Film Room interface.

This will eventually allow users to watch automatically generated collections of clips.

For now create selectable playlist cards:

All Player Clips
All Touches
Shot Attempts
Makes
Misses
Drives
Assists
Turnovers
Defense
Rebounds
Positive Decisions
Development Opportunities

Each should display mock:

clip count

total duration

player

game

Create a video-player placeholder and clip queue.

Include playback controls in the UI for:

0.5x
1x
1.25x
1.5x
2x
3x

We will make these functional later.

REELS PAGE

Create a placeholder Reel Builder page.

Explain that users will eventually be able to:

Select approved clips

Reorder clips

Add player intro

Add text overlays

Export a highlight reel

Do not build rendering/export yet.

DEVELOPMENT PAGE

Create a placeholder player-development dashboard.

Future sections should include:

Game Story
Strengths
Development Priorities
Decision Quality
Shot Profile
Paint Touches
Turnover Analysis
Defensive Impact
Recommended Workouts

Create sample/mock data so we can visualize the future product.

Example:

GAME STORY

42 offensive possessions analyzed
7 paint touches
4 rim attempts
6 catch-and-shoot opportunities
3 shots passed up
5 potential assists
2 turnovers
6 defensive disruptions

BIGGEST STRENGTH

"Downhill attacks consistently forced help rotation."

BIGGEST DEVELOPMENT OPPORTUNITY

"Player became less aggressive after turnovers."

RECOMMENDED DEVELOPMENT FOCUS

"Re-attack mentality, contact finishing, and decision-making out of paint touches."

Make it visually clear these are demo values, not actual AI results.

DATABASE

Use the application's normal backend/database system.

Create scalable tables for at least:

users
sports
players
games
game_players
events
clips
playlists
playlist_clips
evaluations

Use relational IDs appropriately.

Do not duplicate unnecessary data.

Keep the database extensible for future:

teams
organizations
coaches
comments
workouts
subscriptions

UX REQUIREMENTS

Use helpful empty states.

A brand-new user with no games should see:

"Your Film Room is empty."

"Upload your first game to begin building your player-development library."

Primary CTA:

Analyze Your First Game

Never populate a real user's account with fake games permanently.

Mock data can be used only for demo/preview purposes.

IMPORTANT PRODUCT RULES

Do NOT build the following yet:

Computer vision

Automatic player tracking

AI event detection

YouTube downloading

Video transcoding

Automatic highlight creation

AI coaching evaluations

Payment system

Team management

Prepare the architecture for those features but do not implement them during this phase.

The goal of Phase 1 is a clean, scalable product foundation that we can safely build on without rewriting the application.

Before making major architectural shortcuts, prioritize scalability, reusable components, and separating sport-specific logic from universal application logic.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://sport-film-hub.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/22f21ebf-7824-47cf-916c-f9ceb2718d4d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
